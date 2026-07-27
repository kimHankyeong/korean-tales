/**
 * Socket.io ↔ Room 연결 — 소켓 이벤트를 방/게임 액션으로 변환한다.
 *
 * 식별(playerId): 로그인 유저는 계정 id(`acct:<userId>`)로 고정 — 새로고침 등으로 소켓이
 * 바뀌어도 같은 사람으로 인식되어 방 멤버십이 유지된다(1번 섹션 "새로고침·재접속 복구").
 * 게스트는 socket.id를 그대로 쓴다(재접속 복구 대상 아님).
 * 개인 전송은 playerId 이름의 소켓 룸으로, 방 전체 전송은 방 코드 룸으로 나간다.
 */

import type { Server, Socket } from 'socket.io';
import {
  RECONNECT_GRACE_SECONDS,
  SOCKET_EVENTS,
  type CharacterId,
  type ChatChannel,
  type ClientGameAction,
  type Faction,
  type RoomSettingsPayload,
  type RoomSummary,
} from '@korean-tales/shared';
import { RoomManager } from '../rooms/roomManager';
import type { JoiningPlayer, RoomEmitter } from '../rooms/room';
import type { AuthService } from '../auth/service';
import { identityOf, registerSocketAuth, type SocketIdentity } from '../auth/socketAuth';
import type { HistoryService } from '../history/service';

type Ack = (response: { ok: boolean; error?: string; room?: unknown }) => void;

function makeEmitter(io: Server, roomCode: string): RoomEmitter {
  return {
    toRoom: (event, payload) => io.to(`room:${roomCode}`).emit(event, payload),
    // playerId는 개인 라우팅용 소켓 룸이기도 하다(connection 핸들러에서 join) — 본인에게만 전송
    toPlayer: (playerId, event, payload) => io.to(playerId).emit(event, payload),
  };
}

/** 로그인 유저는 계정 id로 고정된 안정적 신원, 게스트는 이 연결에 한정된 socket.id */
function stablePlayerId(identity: SocketIdentity, socket: Socket): string {
  return identity.kind === 'USER' ? `acct:${identity.userId}` : socket.id;
}

/**
 * 방 입장 신원 결정 — 로그인 유저는 계정 닉네임이 게임 내 표시 이름(클라이언트가 보낸
 * name 무시), 게스트는 보낸 이름을 정제해서 사용. 게스트 허용 여부는 requirements 9번 미정 —
 * 차단으로 확정되면 socketAuth의 requireAuth로 연결 자체가 거부된다.
 */
function joiningPlayerOf(playerId: string, identity: SocketIdentity, providedName: unknown): JoiningPlayer {
  if (identity.kind === 'USER') {
    return {
      id: playerId,
      name: identity.nickname,
      accountId: identity.userId,
      avatarUrl: identity.profileImageUrl, // 계정 프로필 사진 → 게임 내 프로필 표시 (11번)
    };
  }
  return { id: playerId, name: sanitizeName(providedName), avatarUrl: null };
}

export interface RegisterHandlersOptions {
  /** 지정하면 핸드셰이크에서 세션 쿠키를 검증해 소켓을 계정과 연결한다 */
  auth?: AuthService;
  /** 게스트 연결 거부 (기본 false — REQUIRE_AUTH 환경변수로 전환) */
  requireAuth?: boolean;
  /** 지정하면 게임 종료 시 로그인 유저 참가자의 전적을 기록한다(2번 항목) */
  history?: HistoryService;
}

export function registerHandlers(
  io: Server,
  rng: () => number = Math.random,
  options: RegisterHandlersOptions = {},
): RoomManager {
  const manager = new RoomManager(
    (code) => makeEmitter(io, code),
    rng,
    Date.now,
    options.history
      ? (record) => {
          options.history!.recordGame(record).catch((error: unknown) => {
            console.error('[history] 전적 기록 실패', error);
          });
        }
      : undefined,
  );
  // 대기방(로비)에서 끊긴 로그인 유저를 실제로 제거하기까지의 예약된 타이머 — 그 안에 같은
  // playerId로 재접속하면 취소된다 (1번 섹션 "새로고침·재접속 복구")
  const pendingLobbyLeaves = new Map<string, NodeJS.Timeout>();

  if (options.auth) {
    registerSocketAuth(io, options.auth, { requireAuth: options.requireAuth });
  }

  io.on('connection', (socket) => {
    const identity = identityOf(socket);
    const playerId = stablePlayerId(identity, socket);
    // 개인 라우팅 룸 — 재접속으로 socket.id가 바뀌어도 emitter.toPlayer(playerId, ...)가
    // 새 소켓으로 향하도록 매 연결마다 다시 합류한다
    void socket.join(playerId);

    // 재접속 유예 타이머가 걸려 있었다면 취소 — 로비를 실제로 떠난 게 아니었다
    const pendingLeave = pendingLobbyLeaves.get(playerId);
    if (pendingLeave) {
      clearTimeout(pendingLeave);
      pendingLobbyLeaves.delete(playerId);
    }

    // 이미 속한 방이 있으면(새로고침 등으로 소켓만 바뀐 경우) 현재 상태를 다시 밀어준다
    const existingRoom = manager.roomOf(playerId);
    if (existingRoom) {
      void socket.join(`room:${existingRoom.code}`);
      existingRoom.resyncPlayer(playerId);
    }

    /* ── 로비 ── */

    socket.on(SOCKET_EVENTS.roomCreate, (data: { name?: string }, ack?: Ack) => {
      const room = manager.create(joiningPlayerOf(playerId, identity, data?.name));
      void socket.join(`room:${room.code}`);
      ack?.({ ok: true, room: room.toState() });
    });

    socket.on(SOCKET_EVENTS.roomJoin, (data: { code?: string; name?: string }, ack?: Ack) => {
      const result = manager.join(String(data?.code ?? ''), joiningPlayerOf(playerId, identity, data?.name));
      if (typeof result === 'string') {
        ack?.({ ok: false, error: result });
        return;
      }
      void socket.join(`room:${result.code}`);
      ack?.({ ok: true, room: result.toState() });
    });

    socket.on(SOCKET_EVENTS.roomLeave, () => {
      const room = manager.roomOf(playerId);
      if (room) void socket.leave(`room:${room.code}`);
      manager.leave(playerId);
    });

    socket.on(SOCKET_EVENTS.roomSettings, (settings: RoomSettingsPayload, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.updateSettings(playerId, settings) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    socket.on(
      SOCKET_EVENTS.roomFactionPreference,
      (data: { faction: Faction | null }, ack?: Ack) => {
        const room = manager.roomOf(playerId);
        const error = room
          ? room.setFactionPreference(playerId, data?.faction ?? null)
          : 'NOT_IN_ROOM';
        ack?.(error ? { ok: false, error } : { ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.roomReady, (data: { ready?: boolean }, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.setReady(playerId, !!data?.ready) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    socket.on(
      SOCKET_EVENTS.roomStart,
      (data: { characterId?: CharacterId; fillVirtual?: boolean } | undefined, ack?: Ack) => {
        const room = manager.roomOf(playerId);
        const isAdmin = identity.kind === 'USER' && identity.isAdmin;
        const error = room
          ? room.startGame(playerId, isAdmin, data?.characterId, !!data?.fillVirtual)
          : 'NOT_IN_ROOM';
        ack?.(error ? { ok: false, error } : { ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.roomList, (_data: unknown, ack?: (res: { ok: true; rooms: RoomSummary[] }) => void) => {
      ack?.({ ok: true, rooms: manager.list() });
    });

    socket.on(SOCKET_EVENTS.roomVisibility, (data: { isPublic?: boolean }, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.setVisibility(playerId, !!data?.isPublic) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    socket.on(SOCKET_EVENTS.roomKick, (data: { targetId?: string }, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const targetId = data?.targetId ?? '';
      const error = room ? room.kick(playerId, targetId) : 'NOT_IN_ROOM';
      if (!error && room) {
        io.to(targetId).emit(SOCKET_EVENTS.roomKicked, {});
        // targetId는 이제 socket.id가 아닐 수 있다(로그인 유저는 계정 id) — 개인 라우팅 룸
        // 기준으로 해당 플레이어의 현재 소켓들을 방 룸에서 내보낸다
        io.in(targetId).socketsLeave(`room:${room.code}`);
        manager.leave(targetId);
      }
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    /* ── 게임 ── */

    socket.on(SOCKET_EVENTS.gameAction, (action: ClientGameAction, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.handleAction(playerId, action) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    // 관리자가 가상 플레이어를 대신 조작 (13번)
    socket.on(
      SOCKET_EVENTS.adminPuppetAction,
      (data: { playerId?: string; action?: ClientGameAction } | undefined, ack?: Ack) => {
        const room = manager.roomOf(playerId);
        const isAdmin = identity.kind === 'USER' && identity.isAdmin;
        const error =
          room && data?.playerId && data.action
            ? room.handlePuppetAction(isAdmin, data.playerId, data.action)
            : 'NOT_ALLOWED';
        ack?.(error ? { ok: false, error } : { ok: true });
      },
    );

    socket.on(
      SOCKET_EVENTS.chatSend,
      (data: { channel?: ChatChannel; text?: string }, ack?: Ack) => {
        const text = String(data?.text ?? '').slice(0, 500);
        if (!text.trim()) return;
        const room = manager.roomOf(playerId);
        const error = room ? room.chat(playerId, data?.channel ?? 'PUBLIC', text) : 'NOT_IN_ROOM';
        ack?.(error ? { ok: false, error } : { ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.surrenderAgree, (_data: unknown, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.agreeSurrender(playerId) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

    /*
     * ── 연결 종료 ──
     * 게임 중이면 아무것도 하지 않는다 — 로그인 유저는 playerId가 계정 id로 고정돼 있어
     * 재접속 시 connection 핸들러가 자동으로 방/게임 상태를 복구한다(1번 섹션). 게스트의
     * 게임 중 이탈 정리는 범위 밖(추후 별도 세션).
     * 로비에서는 게스트는 즉시 퇴장 처리하고, 로그인 유저는 유예 시간을 두어 새로고침 같은
     * 짧은 끊김에는 자리를 유지한다.
     */
    socket.on('disconnect', () => {
      const room = manager.roomOf(playerId);
      if (!room || room.inGame) return;
      if (identity.kind !== 'USER') {
        manager.leave(playerId);
        return;
      }
      const timer = setTimeout(() => {
        pendingLobbyLeaves.delete(playerId);
        manager.leave(playerId);
      }, RECONNECT_GRACE_SECONDS * 1000);
      pendingLobbyLeaves.set(playerId, timer);
    });
  });

  return manager;
}

function sanitizeName(name: unknown): string {
  const trimmed = String(name ?? '').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 20) : '무명';
}
