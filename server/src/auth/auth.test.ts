/**
 * 계정 시스템 테스트 — 임시 SQLite 파일에 prisma db push 후 실제 DB로 검증한다.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app';
import { AuthService, SESSION_TTL_MS } from './service';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let tempDir: string;
let prisma: PrismaClient;
let clock = { now: Date.now() };
let auth: AuthService;
let app: FastifyInstance;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'kt-auth-'));
  const databaseUrl = `file:${path.join(tempDir, 'test.db').replace(/\\/g, '/')}`;
  // 스키마 반영 — 새 임시 파일이므로 reset 불필요 (--force-reset은 Prisma AI 가드에 걸림)
  execSync('npx prisma db push --skip-generate', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  auth = new AuthService(prisma, () => clock.now);
  app = await createApp(auth);
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('AuthService (requirements 11번)', () => {
  it('회원가입: argon2 해시로 저장되고 평문은 남지 않는다', async () => {
    const result = await auth.signup({
      email: 'Alpha@Example.com',
      password: 'password123',
      nickname: '달래',
    });
    expect(result.ok).toBe(true);
    const row = await prisma.user.findUnique({ where: { email: 'alpha@example.com' } });
    expect(row!.passwordHash.startsWith('$argon2')).toBe(true);
    expect(row!.passwordHash).not.toContain('password123');
  });

  it('중복 이메일/닉네임·형식 오류를 거부한다', async () => {
    expect(
      (await auth.signup({ email: 'alpha@example.com', password: 'password123', nickname: '새닉' })),
    ).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
    expect(
      (await auth.signup({ email: 'beta@example.com', password: 'password123', nickname: '달래' })),
    ).toEqual({ ok: false, error: 'NICKNAME_TAKEN' });
    expect((await auth.signup({ email: 'not-an-email', password: 'password123', nickname: '가나' })))
      .toEqual({ ok: false, error: 'INVALID_EMAIL' });
    expect((await auth.signup({ email: 'c@d.com', password: 'short', nickname: '가나' })))
      .toEqual({ ok: false, error: 'WEAK_PASSWORD' });
    expect((await auth.signup({ email: 'c@d.com', password: 'password123', nickname: '가' })))
      .toEqual({ ok: false, error: 'INVALID_NICKNAME' });
  });

  it('로그인: 올바른 비밀번호만 통과, 계정 존재 여부는 응답으로 구분 불가', async () => {
    const ok = await auth.login({ email: 'alpha@example.com', password: 'password123' });
    expect(ok.ok).toBe(true);
    const wrong = await auth.login({ email: 'alpha@example.com', password: 'wrong-password' });
    const ghost = await auth.login({ email: 'ghost@example.com', password: 'password123' });
    expect(wrong).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(ghost).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  it('세션 검증: 로그아웃·만료 시 무효화된다', async () => {
    const login = await auth.login({ email: 'alpha@example.com', password: 'password123' });
    if (!login.ok) throw new Error('login failed');

    expect((await auth.validateSession(login.token))?.nickname).toBe('달래');

    // 만료 — 주입한 시계를 TTL 이후로 이동
    const originalNow = clock.now;
    clock.now = originalNow + SESSION_TTL_MS + 1000;
    expect(await auth.validateSession(login.token)).toBeNull();
    clock.now = originalNow;

    // 로그아웃 — 즉시 무효
    const again = await auth.login({ email: 'alpha@example.com', password: 'password123' });
    if (!again.ok) throw new Error('login failed');
    await auth.logout(again.token);
    expect(await auth.validateSession(again.token)).toBeNull();
  });
});

describe('REST API — Bearer 토큰 세션', () => {
  let token: string;

  it('POST /auth/signup: 201 + 세션 토큰 발급 (가입 즉시 로그인)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'rest@example.com', password: 'password123', nickname: '바우' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().user.nickname).toBe('바우');
    expect(response.json().user.passwordHash).toBeUndefined(); // 해시 비노출
    expect(typeof response.json().token).toBe('string');
    token = response.json().token as string;
  });

  it('GET /auth/me: Authorization 헤더로 본인 정보 조회, 없으면 401', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('rest@example.com');

    const anonymous = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('POST /auth/logout: 세션 무효화 → 이후 me는 401', async () => {
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('POST /auth/login: 잘못된 자격증명은 401', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'rest@example.com', password: 'nope-nope' },
    });
    expect(bad.statusCode).toBe(401);
  });
});
