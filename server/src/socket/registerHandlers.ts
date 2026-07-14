/**
 * Socket.io ↔ Room 연결 — 소켓 이벤트를 방/게임 액션으로 변환한다.
 *
 * 식별: playerId = socket.id (재접속·계정 연동은 이후 세션).
 * 개인 전송은 socket.id 개인 룸으로, 방 전체 전송은 방 코드 룸으로 나간다.
 */

import type { Server } from 'socket.io';
import {
  SOCKET_EVENTS,
  type ChatChannel,
  type ClientGameAction,
  type Faction,
  type RoomSettingsPayload,
} from '@korean-tales/shared';
import { RoomManager } from '../rooms/roomManager';
import type { RoomEmitter } from '../rooms/room';

type Ack = (response: { ok: boolean; error?: string; room?: unknown }) => void;

function makeEmitter(io: Server, roomCode: string): RoomEmitter {
  return {
    toRoom: (event, payload) => io.to(`room:${roomCode}`).emit(event, payload),
    // socket.id는 소켓 개인 룸이기도 하다 — 본인에게만 전송
    toPlayer: (playerId, event, payload) => io.to(playerId).emit(event, payload),
  };
}

export function registerHandlers(io: Server, rng: () => number = Math.random): RoomManager {
  const manager = new RoomManager((code) => makeEmitter(io, code), rng);

  io.on('connection', (socket) => {
    const playerId = socket.id;

    /* ── 로비 ── */

    socket.on(SOCKET_EVENTS.roomCreate, (data: { name?: string }, ack?: Ack) => {
      const name = sanitizeName(data?.name);
      const room = manager.create({ id: playerId, name });
      void socket.join(`room:${room.code}`);
      ack?.({ ok: true, room: room.toState() });
    });

    socket.on(SOCKET_EVENTS.roomJoin, (data: { code?: string; name?: string }, ack?: Ack) => {
      const result = manager.join(String(data?.code ?? ''), {
        id: playerId,
        name: sanitizeName(data?.name),
      });
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

    socket.on(SOCKET_EVENTS.roomStart, (_data: unknown, ack?: Ack) => {
      const room = manager.roomOf(playerId);
      const error = room ? room.startGame(playerId) : 'NOT_IN_ROOM';
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
