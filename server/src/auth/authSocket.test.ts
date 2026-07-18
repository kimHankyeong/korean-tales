/**
 * Socket.io 핸드셰이크 인증 통합 테스트 — 세션 토큰(auth.token)으로 소켓이 계정과 연결되고,
 * 로그인 닉네임이 게임 내 표시 이름으로 강제되는지 실제 왕복으로 검증한다.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { SOCKET_EVENTS, type RoomStatePayload } from '@korean-tales/shared';
import { createApp } from '../app';
import { registerHandlers } from '../socket/registerHandlers';
import type { RoomManager } from '../rooms/roomManager';
import { AuthService } from './service';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let tempDir: string;
let prisma: PrismaClient;
let app: FastifyInstance;
let io: Server;
let manager: RoomManager;
let port: number;
const clients: ClientSocket[] = [];

function connect(token?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
    });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'kt-authsock-'));
  const databaseUrl = `file:${path.join(tempDir, 'test.db').replace(/\\/g, '/')}`;
  // 새 임시 파일이므로 reset 불필요 (--force-reset은 Prisma AI 가드에 걸림)
  execSync('npx prisma db push --skip-generate', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const auth = new AuthService(prisma);

  app = await createApp(auth);
  await app.ready();
  io = new Server(app.server);
  manager = registerHandlers(io, Math.random, { auth });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
}, 60_000);

afterAll(async () => {
  for (const c of clients) c.disconnect();
  manager.disposeAll();
  io.close();
  await app.close();
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('소켓 핸드셰이크 ↔ 계정 연동 (requirements 11번)', () => {
  it('세션 토큰으로 연결하면 방 입장 시 계정 닉네임이 표시 이름으로 사용된다', async () => {
    // REST로 가입 → 세션 토큰 획득
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'sock@example.com', password: 'password123', nickname: '한별' },
    });
    expect(signup.statusCode).toBe(201);
    const token = signup.json().token as string;

    // 토큰을 들고 소켓 연결 → 방 생성 시 클라이언트가 보낸 name은 무시된다
    const socket = await connect(token);
    const created = await socket.emitWithAck(SOCKET_EVENTS.roomCreate, { name: '무시될이름' });
    expect(created.ok).toBe(true);
    const state = created.room as RoomStatePayload;
    expect(state.players[0]!.name).toBe('한별'); // 계정 닉네임 강제

    // Room 내부에는 계정 id가 연결되어 있다 (추후 전적 연동용)
    const room = manager.get(state.code)!;
    expect(room.players[0]!.accountId).toBeTruthy();
  });

  it('토큰 없이 연결하면 게스트로 동작한다 (허용 여부 미정 — 현재 기본 허용)', async () => {
    const socket = await connect();
    const created = await socket.emitWithAck(SOCKET_EVENTS.roomCreate, { name: '손님' });
    expect(created.ok).toBe(true);
    const state = created.room as RoomStatePayload;
    expect(state.players[0]!.name).toBe('손님');
    const room = manager.get(state.code)!;
    expect(room.players[0]!.accountId).toBeUndefined();
  });

  it('위조된 세션 토큰은 계정 연결 없이 게스트로 처리된다', async () => {
    const socket = await connect('forged-token-value');
    const created = await socket.emitWithAck(SOCKET_EVENTS.roomCreate, { name: '수상한자' });
    expect(created.ok).toBe(true);
    const state = created.room as RoomStatePayload;
    expect(state.players[0]!.name).toBe('수상한자'); // USER 신원 미부여
  });
});
