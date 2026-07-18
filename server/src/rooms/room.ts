/**
 * Room — 방(로비)과 게임 세션의 생명주기를 관리한다.
 *
 * 소켓 전송은 RoomEmitter 인터페이스 뒤로 추상화되어 있어(테스트에서 페이크 주입),
 * 정보 은닉 스코프는 전부 이 파일에서 결정된다:
 * - gameRole: 본인에게만 / gameState: 공개 정보만 방 전체
 * - gameInvestigation: 해태 본인에게만
 * - chat 'EVIL' 채널: 악 진영 생존자에게만 (밤)
 * - surrenderProgress: 같은 팀에게만
 */

import {
  CHARACTER_BY_ID,
  DEFAULT_ROOM_TIMER_SETTINGS,
  ROOM_OPTIONS,
  ROSTER_BY_MODE,
  SOCKET_EVENTS,
  TIMER_CONFIG,
  type CharacterId,
  type ChatChannel,
  type ChatMessagePayload,
  type ClientGameAction,
  type Faction,
  type GameOverPayload,
  type RoomSettingsPayload,
  type RoomStatePayload,
  type SurrenderProgressPayload,
} from '@korean-tales/shared';
import { isActionAllowed } from '../game/actionAuth';
import { assignCharacters } from '../game/assign';
import { buildGameResult, phasePath, toPublicGameState } from '../game/publicState';
import { GameSession, type GameSnapshot } from '../game/session';
import { PhaseTimer } from '../game/timer';
import type { GamePlayer, InvestigationRecord } from '../game/types';

/** 소켓 전송 추상화 — registerHandlers가 io 기반 구현을 주입한다 */
export interface RoomEmitter {
  toRoom(event: string, payload: unknown): void;
  toPlayer(playerId: string, event: string, payload: unknown): void;
}

export interface RoomPlayer {
  id: string;
  name: string;
  factionPreference: Faction | null;
  /** 로그인 유저의 계정 id — 게스트는 없음 (추후 전적/마이페이지 연동용) */
  accountId?: string;
  /** 계정 프로필 사진 URL — 게스트/미설정은 null (기본 아바타) */
  avatarUrl: string | null;
  /** 준비 완료 여부 — 인원 변경·설정 변경 시 전원 초기화 (1번 섹션 준비 시스템) */
  ready: boolean;
}

/** 방 생성/입장 시 신원 — name은 로그인 유저면 계정 닉네임 (registerHandlers에서 결정) */
export interface JoiningPlayer {
  id: string;
  name: string;
  accountId?: string;
  avatarUrl?: string | null;
}

export type RoomError =
  | 'ROOM_FULL'
  | 'ALREADY_IN_GAME'
  | 'NOT_HOST'
  | 'INVALID_SETTINGS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_IN_ROOM'
  | 'NOT_ALLOWED'
  | 'INVALID_CHARACTER';

export interface SurrenderState {
  faction: Faction;
  agreed: Set<string>;
  endsAt: number;
}

/** 방 설정 검증 — 값은 반드시 ROOM_OPTIONS의 선택지여야 한다 (1번 섹션) */
export function isValidSettings(settings: RoomSettingsPayload): boolean {
  return (
    (ROOM_OPTIONS.playerModes as readonly number[]).includes(settings.mode) &&
    (ROOM_OPTIONS.personalSpeechSeconds as readonly number[]).includes(
      settings.personalSpeechSeconds,
    ) &&
    (ROOM_OPTIONS.discussionSeconds as readonly number[]).includes(settings.discussionSeconds)
  );
}

export class Room {
  readonly code: string;
  hostId: string;
  settings: RoomSettingsPayload;
  players: RoomPlayer[] = [];
  session: GameSession | null = null;
  /** 공개방 목록(room:list)에 노출되는지 — 게임이 끝나면 자동으로 false가 된다 */
  isPublic = true;

  private surrender: SurrenderState | null = null;
  private readonly surrenderTimer = new PhaseTimer();
  private lastInvestigation: InvestigationRecord | null = null;
  /** 관리자가 정원을 채우려고 만든 가상 플레이어 id들 (13번 — 실제 소켓 없음, 관리자가 대신 조작) */
  private readonly virtualPlayerIds = new Set<string>();
  private virtualCounter = 0;
  /** 가상 플레이어 조작 권한을 가진 관리자 — virtualPlayerIds가 비어 있으면 의미 없음 */
  private adminPlayerId: string | null = null;

  constructor(
    code: string,
    host: JoiningPlayer,
    private readonly emitter: RoomEmitter,
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {
    this.code = code;
    this.hostId = host.id;
    this.settings = { mode: 9, ...DEFAULT_ROOM_TIMER_SETTINGS };
    this.players.push({
      id: host.id,
      name: host.name,
      factionPreference: null,
      accountId: host.accountId,
      avatarUrl: host.avatarUrl ?? null,
      ready: false,
    });
  }

  get inGame(): boolean {
    return this.session !== null;
  }

  toState(): RoomStatePayload {
    return {
      code: this.code,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === this.hostId,
        avatarUrl: p.avatarUrl,
        ready: p.ready,
      })),
      inGame: this.inGame,
      isPublic: this.isPublic,
    };
  }

  private broadcastRoomState(): void {
    this.emitter.toRoom(SOCKET_EVENTS.roomState, this.toState());
  }

  /** 인원·설정이 바뀌면 이전 준비 확인은 무효 — 전원 다시 눌러야 한다 */
  private resetReady(): void {
    this.players = this.players.map((p) => ({ ...p, ready: false }));
  }

  /* ── 로비 ─────────────────────────────────────── */

  join(player: JoiningPlayer): RoomError | null {
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (this.players.length >= this.settings.mode) return 'ROOM_FULL';
    if (!this.players.some((p) => p.id === player.id)) {
      this.players.push({
        id: player.id,
        name: player.name,
        factionPreference: null,
        accountId: player.accountId,
        avatarUrl: player.avatarUrl ?? null,
        ready: false,
      });
      this.resetReady();
    }
    this.broadcastRoomState();
    return null;
  }

  /** @returns 방이 비어 폐기해야 하면 true */
  leave(playerId: string): boolean {
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.players.length === 0) return true;
    // 방장 승계: 남은 사람 중 먼저 들어온 순
    if (this.hostId === playerId) this.hostId = this.players[0]!.id;
    this.resetReady();
    this.broadcastRoomState();
    return false;
  }

  updateSettings(requesterId: string, settings: RoomSettingsPayload): RoomError | null {
    if (requesterId !== this.hostId) return 'NOT_HOST';
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (!isValidSettings(settings)) return 'INVALID_SETTINGS';
    // 모드 축소로 정원 초과가 되면 거부
    if (this.players.length > settings.mode) return 'ROOM_FULL';
    this.settings = { ...settings };
    this.resetReady();
    this.broadcastRoomState();
    return null;
  }

  /** 진영 선호 — 배정 보장 아님. 다른 플레이어에게 공개하지 않는다 */
  setFactionPreference(playerId: string, faction: Faction | null): RoomError | null {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return 'NOT_IN_ROOM';
    player.factionPreference = faction;
    return null;
  }

  /** 공개/비공개 전환 — 방장 전용. 게임 종료 시 자동으로 비공개 전환된 방을 다시 공개할 때도 사용 */
  setVisibility(requesterId: string, isPublic: boolean): RoomError | null {
    if (requesterId !== this.hostId) return 'NOT_HOST';
    this.isPublic = isPublic;
    this.broadcastRoomState();
    return null;
  }

  /**
   * 준비 토글 — 정원(방 설정 인원수)이 정확히 다 차고 전원이 준비되면 자동으로 게임을 시작한다
   * (1번 섹션 준비 시스템). 정원 미달 상태에서도 준비 자체는 허용한다.
   */
  setReady(playerId: string, ready: boolean): RoomError | null {
    if (this.inGame) return 'ALREADY_IN_GAME';
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return 'NOT_IN_ROOM';
    player.ready = ready;
    this.broadcastRoomState();

    if (this.players.length === this.settings.mode && this.players.every((p) => p.ready)) {
      this.beginGame();
    }
    return null;
  }

  /* ── 게임 시작 ────────────────────────────────── */

  /** 정원 미달 관리자 시작 전용 — 가상 플레이어(가짜 슬롯)를 만들어 채운다. 실제 소켓이 없으므로
   *  toPlayer 전송은 그냥 아무에게도 닿지 않고 사라진다(안전). 이름은 프론트에서 구분 가능하게. */
  private fillWithVirtualPlayers(count: number): void {
    for (let i = 0; i < count; i++) {
      this.virtualCounter += 1;
      const id = `virtual:${this.code}:${this.virtualCounter}`;
      this.virtualPlayerIds.add(id);
      this.players.push({
        id,
        name: `가상플레이어${this.virtualCounter}`,
        factionPreference: null,
        avatarUrl: null,
        ready: true,
      });
    }
  }

  /**
   * @param isAdmin true(ADMIN_EMAILS 계정)면 정원 미달이어도 시작을 허용한다
   * (13번 — 봇 없이 실제 참여 인원만으로 혼자 테스트 가능하게).
   * @param characterId 관리자 전용 — 지정하면 요청자 본인이 그 캐릭터로 확정 배정된다(테스트 목적).
   *   일반 유저가 보내도 무시된다(isAdmin이 아니면 서버가 반영하지 않음).
   * @param fillVirtual 관리자 전용 — true면 남은 정원을 가상 플레이어로 채워 시작한다.
   *   가상 플레이어는 admin:puppetAction으로 관리자가 대신 투표·발언 스킵·스킬을 지정해야 진행된다.
   */
  startGame(
    requesterId: string,
    isAdmin = false,
    characterId?: CharacterId,
    fillVirtual = false,
  ): RoomError | null {
    if (requesterId !== this.hostId) return 'NOT_HOST';
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (isAdmin && fillVirtual && this.players.length < this.settings.mode) {
      this.fillWithVirtualPlayers(this.settings.mode - this.players.length);
    }
    if (this.players.length === 0) return 'NOT_ENOUGH_PLAYERS';
    if (!isAdmin && this.players.length !== this.settings.mode) return 'NOT_ENOUGH_PLAYERS';
    if (isAdmin && characterId && !ROSTER_BY_MODE[this.settings.mode].includes(characterId)) {
      return 'INVALID_CHARACTER';
    }
    if (isAdmin) this.adminPlayerId = requesterId;
    const fixedCharacter = isAdmin && characterId ? { playerId: requesterId, characterId } : undefined;
    return this.beginGame(isAdmin, fixedCharacter);
  }

  /** 실제 게임 시작 처리 — 정원·권한 검증은 호출부(startGame/setReady)가 담당 */
  private beginGame(
    allowUnderstaffed = false,
    fixedCharacter?: { playerId: string; characterId: CharacterId },
  ): RoomError | null {
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (!allowUnderstaffed && this.players.length !== this.settings.mode) return 'NOT_ENOUGH_PLAYERS';

    // 1) 캐릭터 무작위 배정 (진영 선호 우선 고려 — 보장 아님. 관리자 지정이 있으면 그 사람만 확정)
    const assignment = assignCharacters(
      this.players.map((p) => ({ playerId: p.id, factionPreference: p.factionPreference })),
      this.settings.mode,
      this.rng,
      allowUnderstaffed,
      fixedCharacter ? { [fixedCharacter.playerId]: fixedCharacter.characterId } : undefined,
    );

    const gamePlayers: GamePlayer[] = this.players.map((p, i) => {
      const characterId = assignment[p.id]!;
      return {
        id: p.id,
        seat: i + 1, // 배정 번호 = 입장 순서
        characterId,
        faction: CHARACTER_BY_ID[characterId].faction,
        alive: true,
        skillUses: {},
      };
    });

    // 2) 세션 구성 — 타이머 동기화·상태 브로드캐스트 연결
    this.session = new GameSession({
      players: gamePlayers,
      rng: this.rng,
      mode: this.settings.mode,
      settings: {
        personalSpeechSeconds: this.settings.personalSpeechSeconds,
        discussionSeconds: this.settings.discussionSeconds,
      },
      onTimerSync: (payload) => this.emitter.toRoom(SOCKET_EVENTS.timerSync, payload),
      onTimerClear: () => this.emitter.toRoom(SOCKET_EVENTS.timerClear, {}),
      onSnapshot: (snapshot) => this.onSnapshot(snapshot),
      now: this.now,
    });

    // 3) 본인 캐릭터만 비공개 전송 — 남의 직업은 절대 알 수 없음
    for (const gp of gamePlayers) {
      this.emitter.toPlayer(gp.id, SOCKET_EVENTS.gameRole, {
        characterId: gp.characterId,
        faction: gp.faction,
        seat: gp.seat,
      });
    }

    // session.start()가 onSnapshot을 1회 호출하며 broadcastAdminRoster까지 함께 처리한다
    this.session.start();
    this.broadcastRoomState();
    this.broadcastPublicState(this.session.getSnapshot());
    return null;
  }

  /* ── 상태 브로드캐스트 (정보 은닉) ─────────────── */

  private playerMeta(): Record<string, { name: string; avatarUrl: string | null }> {
    return Object.fromEntries(
      this.players.map((p) => [p.id, { name: p.name, avatarUrl: p.avatarUrl }]),
    );
  }

  private broadcastPublicState(snapshot: GameSnapshot): void {
    this.emitter.toRoom(SOCKET_EVENTS.gameState, toPublicGameState(snapshot, this.playerMeta()));
  }

  /**
   * 관리자가 시작한 게임이면 전원의 배정을 관리자 본인에게만 알려준다(13번 — 전지적 테스트 시점).
   * 가상 플레이어가 없어도(일반 정원으로 시작한 관리자여도) 매번 새로 보낸다 — 클라이언트가
   * "이번 게임엔 조작할 가상 플레이어가 없다"를 알 수 있어야 이전 게임의 목록이 남지 않는다.
   */
  private broadcastAdminRoster(players: readonly GamePlayer[]): void {
    if (!this.adminPlayerId) return;
    const meta = this.playerMeta();
    this.emitter.toPlayer(this.adminPlayerId, SOCKET_EVENTS.adminRoster, {
      players: players.map((p) => ({
        playerId: p.id,
        name: meta[p.id]?.name ?? p.id,
        isVirtual: this.virtualPlayerIds.has(p.id),
        characterId: p.characterId,
        faction: p.faction,
        seat: p.seat,
        alive: p.alive,
      })),
    });
  }

  private onSnapshot(snapshot: GameSnapshot): void {
    // 해태 투사 결과 — 본인에게만 (새 결과가 기록된 경우에만 1회). 해태가 가상 플레이어면
    // 실제 소켓이 없어 결과를 볼 수 없으므로, 대신 조작해야 할 관리자에게도 함께 보낸다
    const investigation = snapshot.context.lastInvestigation;
    if (investigation && investigation !== this.lastInvestigation) {
      const haetae = snapshot.context.players.find((p) => p.characterId === 'haetae');
      if (haetae) {
        this.emitter.toPlayer(haetae.id, SOCKET_EVENTS.gameInvestigation, { ...investigation });
        if (this.virtualPlayerIds.has(haetae.id) && this.adminPlayerId) {
          this.emitter.toPlayer(this.adminPlayerId, SOCKET_EVENTS.gameInvestigation, { ...investigation });
        }
      }
    }
    this.lastInvestigation = investigation;

    // 자청비 부활꽃 대상 후보 — 그날 밤 악 진영 킬 사망자만 (본인에게만, 5번 섹션).
    // 자청비가 가상 플레이어면 마찬가지로 관리자에게도 보내야 대신 선택할 수 있다
    if (phasePath(snapshot.value) === 'day.flowerDecision') {
      const jacheongbi = snapshot.context.players.find((p) => p.characterId === 'jacheongbi');
      if (jacheongbi?.alive) {
        const revivableTargetIds = snapshot.context.pendingDeaths
          .filter((d) => d.cause === 'EVIL_NIGHT_KILL' && d.applied)
          .map((d) => d.playerId);
        // 도깨비 장난으로 살아남은 대상 — 실제로는 되살릴 필요가 없지만, 선택 시 둘 다 소모 처리된다
        if (
          snapshot.context.dokkaebiSavedTargetId &&
          !revivableTargetIds.includes(snapshot.context.dokkaebiSavedTargetId)
        ) {
          revivableTargetIds.push(snapshot.context.dokkaebiSavedTargetId);
        }
        this.emitter.toPlayer(jacheongbi.id, SOCKET_EVENTS.gameFlowerOptions, { revivableTargetIds });
        if (this.virtualPlayerIds.has(jacheongbi.id) && this.adminPlayerId) {
          this.emitter.toPlayer(this.adminPlayerId, SOCKET_EVENTS.gameFlowerOptions, { revivableTargetIds });
        }
      }
    }

    this.broadcastPublicState(snapshot);
    this.broadcastAdminRoster(snapshot.context.players);

    // 게임 종료 — 이때만 역할 전체 공개 + 개인별 승패 귀속 (중립은 생존 시 승리 팀 합류)
    if (snapshot.status === 'done' && snapshot.context.winner) {
      this.cancelSurrender('COMPLETED_GAME');
      const payload: GameOverPayload = buildGameResult(
        snapshot.context.players,
        snapshot.context.winner,
      );
      this.emitter.toRoom(SOCKET_EVENTS.gameOver, payload);
      this.endSession();
    }
  }

  private endSession(): void {
    this.session?.stop();
    this.session = null;
    this.lastInvestigation = null;
    this.surrenderTimer.cancel();
    this.surrender = null;
    // 가상 플레이어는 실제 사람이 아니므로 게임이 끝나면 로비에서 제거한다 —
    // 남겨두면 아무도 대신 준비를 눌러줄 수 없어 자동 시작이 영원히 막힌다
    if (this.virtualPlayerIds.size > 0) {
      this.players = this.players.filter((p) => !this.virtualPlayerIds.has(p.id));
      this.virtualPlayerIds.clear();
    }
    // adminPlayerId는 매 게임 시작마다 새로 정해진다 — 다음 시작이 관리자가 아니면
    // (또는 다른 사람이 방장을 승계했으면) 이전 게임의 롤 목록을 계속 받으면 안 된다
    this.adminPlayerId = null;
    // 재시작(다시하기) 시 낯선 사람이 끼어들지 못하도록 자동 비공개 전환 + 전원 재준비 요구
    this.isPublic = false;
    this.resetReady();
    this.broadcastRoomState();
  }

  /* ── 게임 액션 (권한 검증 후 머신 주입) ─────────── */

  handleAction(senderId: string, action: ClientGameAction): RoomError | null {
    if (!this.session) return 'NOT_IN_ROOM';
    if (!isActionAllowed(senderId, action, this.session.getSnapshot())) return 'NOT_ALLOWED';
    this.session.send(action);
    return null;
  }

  /**
   * 관리자가 가상 플레이어를 대신해 액션을 제출한다(13번). 실제 발신자는 관리자 소켓이지만,
   * 권한 판정은 가상 플레이어의 id로 그대로 isActionAllowed를 태워 기존 로직을 재사용한다
   * (본인 명의 강제·캐릭터 전용 스킬 등 검증이 자동으로 그 가상 플레이어 기준으로 적용됨).
   */
  handlePuppetAction(isAdmin: boolean, targetPlayerId: string, action: ClientGameAction): RoomError | null {
    if (!this.session) return 'NOT_IN_ROOM';
    if (!isAdmin || !this.virtualPlayerIds.has(targetPlayerId)) return 'NOT_ALLOWED';
    if (!isActionAllowed(targetPlayerId, action, this.session.getSnapshot())) return 'NOT_ALLOWED';
    this.session.send(action);
    return null;
  }

  /* ── 채팅 (채널 스코프) ────────────────────────── */

  chat(senderId: string, channel: ChatChannel, text: string): RoomError | null {
    const name = this.players.find((p) => p.id === senderId)?.name;
    if (!name) return 'NOT_IN_ROOM';
    const payload: ChatMessagePayload = {
      channel,
      senderId,
      senderName: name,
      text,
      sentAt: this.now(),
    };

    // 로비 채팅 — 전체
    if (!this.session) {
      if (channel !== 'PUBLIC') return 'NOT_ALLOWED';
      this.emitter.toRoom(SOCKET_EVENTS.chatMessage, payload);
      return null;
    }

    const snapshot = this.session.getSnapshot();
    const sender = snapshot.context.players.find((p) => p.id === senderId);
    if (!sender?.alive) return 'NOT_ALLOWED'; // 사망자는 관전만

    const isNight = phasePath(snapshot.value).startsWith('night');

    if (channel === 'EVIL') {
      // 악 진영 전용 채널 — 밤에만, 악 진영 생존자에게만 중계 (요구: 밤 비밀 채팅 격리)
      if (sender.faction !== 'EVIL' || !isNight) return 'NOT_ALLOWED';
      for (const p of snapshot.context.players) {
        if (p.faction === 'EVIL') this.emitter.toPlayer(p.id, SOCKET_EVENTS.chatMessage, payload);
      }
      return null;
    }

    // 공개 채팅 — 밤에는 전체 토론 페이즈가 없으므로 아무도 쓸 수 없다 (악 진영은 EVIL 채널 사용)
    if (isNight) return 'NOT_ALLOWED';

    this.emitter.toRoom(SOCKET_EVENTS.chatMessage, payload);
    return null;
  }

  /* ── 투항 — 30초 팀 동의 (6번 섹션) ────────────── */

  /**
   * 투항에 동의해야 하는 생존자 id 목록 — 선 진영 투항은 생존 중립도 함께 동의해야 한다
   * (중립은 선 진영 승리에 편승하므로, 8번 섹션). 악 진영 투항은 악 진영 생존자만 대상.
   */
  private surrenderRequiredIds(faction: Faction, snapshot: GameSnapshot): string[] {
    return snapshot.context.players
      .filter((p) => p.alive && (p.faction === faction || (faction === 'GOOD' && p.faction === 'NEUTRAL')))
      .map((p) => p.id);
  }

  /**
   * 최초 클릭 = 진행 시작(30초 카운트), 이후 같은 팀(+선 진영이면 중립) 클릭 = 동의.
   * 중립은 선 진영 투항에 동참만 가능하고 스스로 투항을 시작할 수는 없다.
   * 진행 상황은 동의 대상에게만 전송되어 상대 팀에 노출되지 않는다.
   * 30초 내 전원 동의 → TEAM_SURRENDER로 게임 종료 (상대 팀 승리).
   */
  agreeSurrender(playerId: string): RoomError | null {
    if (!this.session) return 'NOT_IN_ROOM';
    const snapshot = this.session.getSnapshot();
    const player = snapshot.context.players.find((p) => p.id === playerId);
    if (!player?.alive) return 'NOT_ALLOWED';

    if (!this.surrender) {
      // 진행 시작 — 중립은 스스로 시작할 수 없음(선/악 팀 단위)
      if (player.faction === 'NEUTRAL') return 'NOT_ALLOWED';
      this.surrender = {
        faction: player.faction,
        agreed: new Set([playerId]),
        endsAt: this.now() + TIMER_CONFIG.surrenderConsent * 1000,
      };
      this.surrenderTimer.start(
        `surrender:${player.faction}`,
        TIMER_CONFIG.surrenderConsent * 1000,
        // 30초 내 전원 동의 실패 → 진행 종료 (게임 계속)
        () => this.cancelSurrender('TIMEOUT'),
      );
    } else {
      // 다른 팀(선 진영 투항에 동참하는 중립은 예외) 진행 중이면 거부
      const eligible =
        this.surrender.faction === player.faction ||
        (this.surrender.faction === 'GOOD' && player.faction === 'NEUTRAL');
      if (!eligible) return 'NOT_ALLOWED';
      this.surrender.agreed.add(playerId);
    }

    const required = this.surrenderRequiredIds(this.surrender.faction, snapshot);
    const complete = required.every((id) => this.surrender!.agreed.has(id));

    this.broadcastSurrenderProgress(required, complete ? 'COMPLETED' : 'IN_PROGRESS');

    if (complete) {
      const faction = this.surrender.faction;
      this.surrenderTimer.cancel();
      this.surrender = null;
      this.session.send({ type: 'TEAM_SURRENDER', faction });
    }
    return null;
  }

  private broadcastSurrenderProgress(
    required: string[],
    status: SurrenderProgressPayload['status'],
  ): void {
    if (!this.surrender) return;
    const payload: SurrenderProgressPayload = {
      faction: this.surrender.faction,
      agreed: [...this.surrender.agreed],
      required,
      endsAt: this.surrender.endsAt,
      status,
    };
    // 같은 팀(생존자)에게만 — 상대 팀에 비노출
    for (const id of required) {
      this.emitter.toPlayer(id, SOCKET_EVENTS.surrenderProgress, payload);
    }
  }

  private cancelSurrender(reason: 'TIMEOUT' | 'COMPLETED_GAME'): void {
    if (!this.surrender || !this.session) {
      this.surrender = null;
      return;
    }
    if (reason === 'TIMEOUT') {
      const required = this.surrenderRequiredIds(this.surrender.faction, this.session.getSnapshot());
      this.broadcastSurrenderProgress(required, 'CANCELLED');
    }
    this.surrenderTimer.cancel();
    this.surrender = null;
  }

  dispose(): void {
    this.session?.stop();
    this.session = null;
    this.surrenderTimer.cancel();
  }
}
