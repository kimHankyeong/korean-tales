/**
 * Socket.io 통합 테스트 — 실제 서버·클라이언트 왕복으로 방 생성 → 입장 → 시작 →
 * 비밀 역할 배정까지 검증한다. (7인 모드 — 조언자 선출 없이 바로 낮 시작)
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  ROSTER_BY_MODE,
  SOCKET_EVENTS,
  type GameRolePayload,
  type PublicGameState,
  type RoomStatePayload,
} from '@korean-tales/shared';
import { registerHandlers, } from './registerHandlers';
import type { RoomManager } from '../rooms/roomManager';

let httpServer: HttpServer;
let io: Server;
let manager: RoomManager;
let port: number;
const clients: ClientSocket[] = [];

function connect(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  manager = registerHandlers(io, Math.random);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  manager.disposeAll();
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('Socket.io 실시간 레이어 (7인 모드 풀 사이클)', () => {
  it('방 생성 → 6명 입장 → 시작: 각자 본인 역할만 받고, 공개 상태가 브로드캐스트된다', async () => {
    // 방장 접속·방 생성
    const host = await connect();
    const created = await host.emitWithAck(SOCKET_EVENTS.roomCreate, { name: '방장' });
    expect(created.ok).toBe(true);
    const code = (created.room as RoomStatePayload).code;

    // 7인 모드로 설정
    const settingsAck = await host.emitWithAck(SOCKET_EVENTS.roomSettings, {
      mode: 7,
      personalSpeechSeconds: 80,
      discussionSeconds: 180,
    });
    expect(settingsAck.ok).toBe(true);

    // 6명 입장
    const guests: ClientSocket[] = [];
    for (let i = 0; i < 6; i++) {
      const guest = await connect();
      const joined = await guest.emitWithAck(SOCKET_EVENTS.roomJoin, {
        code,
        name: `유저${i + 2}`,
      });
      expect(joined.ok).toBe(true);
      guests.push(guest);
    }

    // 진영 선호 등록 (게스트 1명이 악 선호)
    await guests[0]!.emitWithAck(SOCKET_EVENTS.roomFactionPreference, { faction: 'EVIL' });

    // 역할·상태 수신 대기 등록 후 시작
    const all = [host, ...guests];
    const rolePromises = all.map((s) => waitFor<GameRolePayload>(s, SOCKET_EVENTS.gameRole));
    const statePromise = waitFor<PublicGameState>(host, SOCKET_EVENTS.gameState);

    const startAck = await host.emitWithAck(SOCKET_EVENTS.roomStart, {});
    expect(startAck.ok).toBe(true);

    const roles = await Promise.all(rolePromises);
    // 7인 로스터가 중복 없이 배정되었고, 각자 자기 것 하나만 받았다
    expect(new Set(roles.map((r) => r.characterId)).size).toBe(7);
    expect(new Set(roles.map((r) => r.characterId))).toEqual(new Set(ROSTER_BY_MODE[7]));
    // 선호 반영 (악 2자리 — 단독 선호이므로 반영)
    expect(roles[1]!.faction).toBe('EVIL');

    // 공개 상태: 7인 모드는 조언자 선출 없이 바로 낮 개인 발언, 역할 정보 없음
    const state = await statePromise;
    expect(state.phase).toBe('day.personalSpeech');
    expect(state.players).toHaveLength(7);
    expect(JSON.stringify(state)).not.toContain('characterId');

    // 비방장 시작 시도 거부 확인 (이미 게임 중이기도 함)
    const badStart = await guests[0]!.emitWithAck(SOCKET_EVENTS.roomStart, {});
    expect(badStart.ok).toBe(false);
  }, 15000);

  it('게임 액션도 소켓으로 전달되고 권한 검증을 거친다 (개인 발언 skip)', async () => {
    // 이전 테스트에서 만든 방이 게임 중 — 첫 발언자는 방장(u1, seat 1)
    const host = clients[0]!;
    const guest = clients[1]!;

    // 타인 명의 skip → 거부
    const spoof = await guest.emitWithAck(SOCKET_EVENTS.gameAction, {
      type: 'SKIP',
      playerId: host.id,
    });
    expect(spoof.ok).toBe(false);

    // 본인(현재 발언자) skip → 승인 + 상태 갱신 브로드캐스트
    const statePromise = waitFor<PublicGameState>(guest, SOCKET_EVENTS.gameState);
    const ownSkip = await host.emitWithAck(SOCKET_EVENTS.gameAction, {
      type: 'SKIP',
      playerId: host.id,
    });
    expect(ownSkip.ok).toBe(true);
    const state = await statePromise;
    expect(state.currentSpeakerId).not.toBe(host.id); // 다음 발언자로 넘어감
  }, 15000);
});
