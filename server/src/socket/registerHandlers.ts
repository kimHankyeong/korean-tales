/**
 * Socket.io ↔ Room 연결 — 소켓 이벤트를 방/게임 액션으로 변환한다.
 *
 * 식별: playerId = socket.id (재접속·계정 연동은 이후 세션).
 * 개인 전송은 socket.id 개인 룸으로, 방 전체 전송은 방 코드 룸으로 나간다.
 */

import type { Server, Socket } from 'socket.io';
import {
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
import { identityOf, registerSocketAuth } from '../auth/socketAuth';

type Ack = (response: { ok: boolean; error?: string; room?: unknown }) => void;

function makeEmitter(io: Server, roomCode: string): RoomEmitter {
  return {
    toRoom: (event, payload) => io.to(`room:${roomCode}`).emit(event, payload),
    // socket.id는 소켓 개인 룸이기도 하다 — 본인에게만 전송
    toPlayer: (playerId, event, payload) => io.to(playerId).emit(event, payload),
  };
}

/**
 * 방 입장 신원 결정 — 로그인 유저는 계정 닉네임이 게임 내 표시 이름(클라이언트가 보낸
 * name 무시), 게스트는 보낸 이름을 정제해서 사용. 게스트 허용 여부는 requirements 9번 미정 —
 * 차단으로 확정되면 socketAuth의 requireAuth로 연결 자체가 거부된다.
 */
function joiningPlayerOf(socket: Socket, providedName: unknown): JoiningPlayer {
  const identity = identityOf(socket);
  if (identity.kind === 'USER') {
    return {
      id: socket.id,
      name: identity.nickname,
      accountId: identity.userId,
      avatarUrl: identity.profileImageUrl, // 계정 프로필 사진 → 게임 내 프로필 표시 (11번)
    };
  }
  return { id: socket.id, name: sanitizeName(providedName), avatarUrl: null };
}

export interface RegisterHandlersOptions {
  /** 지정하면 핸드셰이크에서 세션 쿠키를 검증해 소켓을 계정과 연결한다 */
  auth?: AuthService;
  /** 게스트 연결 거부 (기본 false — REQUIRE_AUTH 환경변수로 전환) */
  requireAuth?: boolean;
}

export function registerHandlers(
  io: Server,
  rng: () => number = Math.random,
  options: RegisterHandlersOptions = {},
): RoomManager {
  const manager = new RoomManager((code) => makeEmitter(io, code), rng);

  if (options.auth) {
    registerSocketAuth(io, options.auth, { requireAuth: options.requireAuth });
  }

  io.on('connection', (socket) => {
    const playerId = socket.id;

    /* ── 로비 ── */

    socket.on(SOCKET_EVENTS.roomCreate, (data: { name?: string }, ack?: Ack) => {
      const room = manager.create(joiningPlayerOf(socket, data?.name));
      void socket.join(`room:${room.code}`);
      ack?.({ ok: true, room: room.toState() });
    });

    socket.on(SOCKET_EVENTS.roomJoin, (data: { code?: string; name?: string }, ack?: Ack) => {
      const result = manager.join(String(data?.code ?? ''), joiningPlayerOf(socket, data?.name));
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
      (data: { characterId?: CharacterId } | undefined, ack?: Ack) => {
        const room = manager.roomOf(playerId);
        const identity = identityOf(socket);
        const isAdmin = identity.kind === 'USER' && identity.isAdmin;
        const error = room ? room.startGame(playerId, isAdmin, data?.characterId) : 'NOT_IN_ROOM';
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

    /* ── 게임 ── */

    socket.on(SOCKET_EVENTS.gameAction, (action: ClientGameAction, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.handleAction(playerId, action) : 'NOT_IN_ROOM';
      ack?.(error ? { ok: false, error } : { ok: true });
    });

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

    /* ── 연결 종료 — 로비면 퇴장 처리 (게임 중 재접속은 이후 세션) ── */
    socket.on('disconnect', () => {
      const room = manager.roomOf(playerId);
      if (room && !room.inGame) manager.leave(playerId);
    });
  });

  return manager;
}

function sanitizeName(name: unknown): string {
  const trimmed = String(name ?? '').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 20) : '무명';
}
