/**
 * HistoryService 테스트 — 게임 종료 시 로그인 유저 전적 기록 + 마이페이지 최근 전적 조회.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../auth/service';
import { HistoryService, type GameHistoryRecord } from './service';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let tempDir: string;
let prisma: PrismaClient;
let auth: AuthService;
let history: HistoryService;
let userA: string;
let userB: string;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'kt-history-'));
  const databaseUrl = `file:${path.join(tempDir, 'test.db').replace(/\\/g, '/')}`;
  execSync('npx prisma db push --skip-generate', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  auth = new AuthService(prisma);
  history = new HistoryService(prisma);

  const signupA = await auth.signup({ email: 'a@example.com', password: 'password123', nickname: '갑돌이' });
  const signupB = await auth.signup({ email: 'b@example.com', password: 'password123', nickname: '을순이' });
  if (!signupA.ok || !signupB.ok) throw new Error('signup failed');
  userA = signupA.user.id;
  userB = signupB.user.id;
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('HistoryService (2번 항목 — 마이페이지 최근 전적)', () => {
  it('로그인 유저 참가자만 기록되고, 게스트뿐인 참가자는 기록에서 제외된다', async () => {
    const record: GameHistoryRecord = {
      mode: 9,
      winner: 'GOOD',
      participants: [
        { accountId: userA, seat: 1, characterId: 'jeoseung', faction: 'EVIL', isWinner: false },
        { accountId: userB, seat: 2, characterId: 'jacheongbi', faction: 'GOOD', isWinner: true },
      ],
    };
    await history.recordGame(record);

    const matchesA = await history.getRecentMatches(userA);
    expect(matchesA).toHaveLength(1);
    expect(matchesA[0]).toMatchObject({
      mode: 9,
      winner: 'GOOD',
      mySeat: 1,
      myCharacterId: 'jeoseung',
      isWinner: false,
    });
    // 같은 판의 전원(로그인 유저만) 좌석순으로 포함
    expect(matchesA[0]!.players).toEqual([
      { seat: 1, characterId: 'jeoseung', nickname: '갑돌이', isWinner: false },
      { seat: 2, characterId: 'jacheongbi', nickname: '을순이', isWinner: true },
    ]);
  });

  it('참가자가 전원 게스트(로그인 유저 없음)면 아무것도 기록하지 않는다', async () => {
    await history.recordGame({ mode: 7, winner: 'EVIL', participants: [] });
    // 예외 없이 조용히 무시 — 별도 조회 대상이 생기지 않음을 간접 확인
    const matches = await history.getRecentMatches(userA);
    expect(matches.every((m) => m.mode !== 7)).toBe(true);
  });

  it('최근 전적은 최신 판부터 최대 3개만 반환한다', async () => {
    for (let i = 0; i < 4; i++) {
      await history.recordGame({
        mode: 9,
        winner: i % 2 === 0 ? 'EVIL' : 'GOOD',
        participants: [{ accountId: userA, seat: 3, characterId: 'haetae', faction: 'GOOD', isWinner: i % 2 !== 0 }],
      });
    }
    const matches = await history.getRecentMatches(userA, 3);
    expect(matches).toHaveLength(3);
    // 내림차순(최신 먼저) — playedAt 기준
    const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    expect(matches.map((m) => m.gameId)).toEqual(sorted.map((m) => m.gameId));
  });

  it('다른 유저의 전적은 섞이지 않는다', async () => {
    const matchesB = await history.getRecentMatches(userB);
    expect(matchesB.every((m) => m.players.some((p) => p.nickname === '을순이'))).toBe(true);
  });
});
