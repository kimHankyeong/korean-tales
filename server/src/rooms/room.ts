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
  SOCKET_EVENTS,
  TIMER_CONFIG,
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
  | 'NOT_ALLOWED';

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
      })),
      inGame: this.inGame,
    };
  }

  private broadcastRoomState(): void {
    this.emitter.toRoom(SOCKET_EVENTS.roomState, this.toState());
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
      });
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

  /* ── 게임 시작 ────────────────────────────────── */

  startGame(requesterId: string): RoomError | null {
    if (requesterId !== this.hostId) return 'NOT_HOST';
    if (this.inGame) return 'ALREADY_IN_GAME';
    if (this.players.length !== this.settings.mode) return 'NOT_ENOUGH_PLAYERS';

    // 1) 캐릭터 무작위 배정 (진영 선호 우선 고려 — 보장 아님)
    const assignment = assignCharacters(
      this.players.map((p) => ({ playerId: p.id, factionPreference: p.factionPreference })),
      this.settings.mode,
      this.rng,
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

    if (channel === 'EVIL') {
      // 악 진영 전용 채널 — 밤에만, 악 진영 생존자에게만 중계 (요구: 밤 비밀 채팅 격리)
      const isNight = phasePath(snapshot.value).startsWith('night');
      if (sender.faction !== 'EVIL' || !isNight) return 'NOT_ALLOWED';
      for (const p of snapshot.context.players) {
        if (p.faction === 'EVIL') this.emitter.toPlayer(p.id, SOCKET_EVENTS.chatMessage, payload);
      }
      return null;
    }

    this.emitter.toRoom(SOCKET_EVENTS.chatMessage, payload);
    return null;
  }

  /* ── 투항 — 30초 팀 동의 (6번 섹션) ────────────── */

  /**
   * 최초 클릭 = 진행 시작(30초 카운트), 이후 같은 팀 클릭 = 동의.
   * 진행 상황은 같은 팀에게만 전송되어 상대 팀에 노출되지 않는다.
   * 30초 내 팀 생존자 전원 동의 → TEAM_SURRENDER로 게임 종료 (상대 팀 승리).
   */
  agreeSurrender(playerId: string): RoomError | null {
    if (!this.session) return 'NOT_IN_ROOM';
    const snapshot = this.session.getSnapshot();
    const player = snapshot.context.players.find((p) => p.id === playerId);
    if (!player?.alive) return 'NOT_ALLOWED';
    if (player.faction === 'NEUTRAL') return 'NOT_ALLOWED'; // 투항은 선/악 팀 단위

    if (!this.surrender) {
      // 진행 시작
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
      if (this.surrender.faction !== player.faction) return 'NOT_ALLOWED'; // 다른 팀 진행 중
      this.surrender.agreed.add(playerId);
    }

    const required = snapshot.context.players
      .filter((p) => p.alive && p.faction === this.surrender!.faction)
      .map((p) => p.id);
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
      const snapshot = this.session.getSnapshot();
      const required = snapshot.context.players
        .filter((p) => p.alive && p.faction === this.surrender!.faction)
        .map((p) => p.id);
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
