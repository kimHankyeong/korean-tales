/**
 * Socket.io 통합 테스트 — 실제 서버·클라이언트 왕복으로 방 생성 → 입장 → 시작 →
 * 비밀 역할 배정까지 검증한다. (7인 모드 — 게임은 항상 밤부터 시작, 조언자 선출은 없음)
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

    // 공개 상태: 게임은 항상 밤부터 시작 (7인 모드는 밤 0이 끝나면 조언자 선출 없이 바로
    // 낮 개인 발언으로 이어지지만, 실시간 타이머라 그 전환까지 기다리진 않고 최초 상태만 검증)
    const state = await statePromise;
    expect(state.phase).toBe('night.evilDiscussion'); // 13번 재배치 — 악 토론이 밤의 첫 단계
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

  it('도중에 나가기(FORFEIT) 후 room:leave를 보내면, 명단(이름 표시용)은 남고 이 소켓만 방 중계에서 빠진다', async () => {
    // 이전 테스트에서 이어지는 같은 게임 — guests[1](u3)이 도중에 나간다
    const leaving = clients[2]!;
    const host = clients[0]!;

    const statePromise = waitFor<PublicGameState>(host, SOCKET_EVENTS.gameState);
    const forfeitAck = await leaving.emitWithAck(SOCKET_EVENTS.gameAction, {
      type: 'FORFEIT',
      playerId: leaving.id,
    });
    expect(forfeitAck.ok).toBe(true);
    const state = await statePromise;
    expect(state.players.find((p) => p.id === leaving.id)?.alive).toBe(false);

    leaving.emit(SOCKET_EVENTS.roomLeave);
    // 서버가 처리할 시간을 준다 — ack가 없는 이벤트라 짧게 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 명단(이름 표시용)에는 여전히 남아있다 — 지워지면 남은 사람 화면에 id가 그대로 노출된다
    expect(manager.roomOf(host.id!)!.players.some((p) => p.id === leaving.id)).toBe(true);

    // 이후 방 전체 브로드캐스트는 더 이상 이 소켓에 닿지 않는다 — 낮/밤 무관하게 항상 유효한
    // 트리거로 다른 생존자의 FORFEIT을 하나 더 사용한다(공개 채팅은 밤에는 막혀 있어 부적합)
    let receivedAfterLeave = false;
    leaving.once(SOCKET_EVENTS.gameState, () => {
      receivedAfterLeave = true;
    });
    const anotherGuest = clients[3]!;
    const anotherAck = await anotherGuest.emitWithAck(SOCKET_EVENTS.gameAction, {
      type: 'FORFEIT',
      playerId: anotherGuest.id,
    });
    expect(anotherAck.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedAfterLeave).toBe(false);
  }, 15000);
});
