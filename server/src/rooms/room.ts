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

  /**
   * @param isAdmin true(ADMIN_EMAILS 계정)면 정원 미달이어도 시작을 허용한다
   * (13번 — 봇 없이 실제 참여 인원만으로 혼자 테스트 가능하게).
   * @param characterId 관리자 전용 — 지정하면 요청자 본인이 그 캐릭터로 확정 배정된다(테스트 목적).
   *   일반 유저가 보내도 무시된다(isAdmin이 아니면 서버가 반영하지 않음).
   */
  startGame(requesterId: string, isAdmin = false, characterId?: CharacterId): RoomError | null {
    if (requesterId !== this.hostId) return 'NOT_HOST';
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (this.players.length === 0) return 'NOT_ENOUGH_PLAYERS';
    if (!isAdmin && this.players.length !== this.settings.mode) return 'NOT_ENOUGH_PLAYERS';
    if (isAdmin && characterId && !ROSTER_BY_MODE[this.settings.mode].includes(characterId)) {
      return 'INVALID_CHARACTER';
    }
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

  private onSnapshot(snapshot: GameSnapshot): void {
    // 해태 투사 결과 — 본인에게만 (새 결과가 기록된 경우에만 1회)
    const investigation = snapshot.context.lastInvestigation;
    if (investigation && investigation !== this.lastInvestigation) {
      const haetae = snapshot.context.players.find((p) => p.characterId === 'haetae');
      if (haetae) {
        this.emitter.toPlayer(haetae.id, SOCKET_EVENTS.gameInvestigation, { ...investigation });
      }
    }
    this.lastInvestigation = investigation;

    // 자청비 부활꽃 대상 후보 — 그날 밤 악 진영 킬 사망자만 (본인에게만, 5번 섹션)
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
      }
    }

    this.broadcastPublicState(snapshot);

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
