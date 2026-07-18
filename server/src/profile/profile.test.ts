/**
 * 마이페이지 API 테스트 — 닉네임 변경 + 아바타 업로드(형식·용량 서버측 재검증)·정적 서빙.
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
import { AuthService } from '../auth/service';
import { MAX_AVATAR_BYTES, sniffImageType } from './avatar';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBytes = (size = 64) => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(size, 1)]);
const webpBytes = () =>
  Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(16, 1)]);

let tempDir: string;
let prisma: PrismaClient;
let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'kt-profile-'));
  const databaseUrl = `file:${path.join(tempDir, 'test.db').replace(/\\/g, '/')}`;
  execSync('npx prisma db push --skip-generate', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const auth = new AuthService(prisma);
  app = await createApp(auth, { uploadsDir: path.join(tempDir, 'uploads') });

  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'me@example.com', password: 'password123', nickname: '달래' },
  });
  token = signup.json().token as string;
  // 닉네임 중복 테스트용 두 번째 유저
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: 'other@example.com', password: 'password123', nickname: '바우' },
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('이미지 형식 판별 (sniffImageType)', () => {
  it('jpg/png/webp 시그니처를 판별하고 그 외는 거부한다', () => {
    expect(sniffImageType(pngBytes())).toBe('png');
    expect(sniffImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]))).toBe('jpg');
    expect(sniffImageType(webpBytes())).toBe('webp');
    expect(sniffImageType(Buffer.from('GIF89a-not-allowed'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(4))).toBeNull(); // 너무 짧음
  });
});

describe('닉네임 변경 (requirements 11번 마이페이지)', () => {
  it('로그인 유저는 닉네임을 바꿀 수 있고 /auth/me에 반영된다', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/profile/nickname',
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: '새달래' },
    });
    expect(patch.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.json().user.nickname).toBe('새달래');
  });

  it('중복·형식 오류·미인증을 거부한다', async () => {
    const taken = await app.inject({
      method: 'PATCH',
      url: '/profile/nickname',
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: '바우' },
    });
    expect(taken.statusCode).toBe(400);
    expect(taken.json().error).toBe('NICKNAME_TAKEN');

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/profile/nickname',
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: '가' },
    });
    expect(invalid.statusCode).toBe(400);

    const anonymous = await app.inject({
      method: 'PATCH',
      url: '/profile/nickname',
      payload: { nickname: '유령' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('비밀번호 변경 (requirements 11번 마이페이지)', () => {
  it('현재 비밀번호가 맞아야 바꿀 수 있고, 이후 새 비밀번호로 로그인된다', async () => {
    const wrong = await app.inject({
      method: 'PATCH',
      url: '/profile/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'wrong-password', newPassword: 'newpassword123' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('INVALID_CURRENT_PASSWORD');

    const short = await app.inject({
      method: 'PATCH',
      url: '/profile/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'password123', newPassword: 'short' },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe('WEAK_PASSWORD');

    const ok = await app.inject({
      method: 'PATCH',
      url: '/profile/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'password123', newPassword: 'newpassword123' },
    });
    expect(ok.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'me@example.com', password: 'newpassword123' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('미인증 요청은 401', async () => {
    const anonymous = await app.inject({
      method: 'PATCH',
      url: '/profile/password',
      payload: { currentPassword: 'x', newPassword: 'newpassword123' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('아바타 업로드 — 서버측 형식·용량 재검증', () => {
  it('유효한 이미지는 저장되고 profileImageUrl이 갱신되며 정적 서빙된다', async () => {
    const body = pngBytes();
    const upload = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: body,
    });
    expect(upload.statusCode).toBe(200);
    const url = upload.json().user.profileImageUrl as string;
    expect(url).toMatch(/^\/uploads\/avatars\/.+\.png\?v=\d+$/);

    const served = await app.inject({ method: 'GET', url: url.split('?')[0]! });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.rawPayload.equals(body)).toBe(true);
  });

  it('형식이 바뀌면 이전 확장자 파일은 새 URL로 대체된다 (webp 재업로드)', async () => {
    const upload = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/webp' },
      payload: webpBytes(),
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().user.profileImageUrl).toContain('.webp');
    // 이전 png는 더 이상 서빙되지 않는다
    const stale = await app.inject({
      method: 'GET',
      url: (upload.json().user.profileImageUrl as string).split('?')[0]!.replace('.webp', '.png'),
    });
    expect(stale.statusCode).toBe(404);
  });

  it('Content-Type을 속여도 실제 바이트가 이미지가 아니면 거부한다', async () => {
    const fake = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: Buffer.from('GIF89a pretending to be png..'),
    });
    expect(fake.statusCode).toBe(400);
    expect(fake.json().error).toBe('INVALID_IMAGE');
  });

  it('허용되지 않은 MIME(gif)·2MB 초과·미인증을 거부한다', async () => {
    const gif = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/gif' },
      payload: Buffer.from('GIF89a'),
    });
    expect(gif.statusCode).toBe(415);

    const huge = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: Buffer.concat([PNG_SIGNATURE, Buffer.alloc(MAX_AVATAR_BYTES + 2048, 1)]),
    });
    expect(huge.statusCode).toBe(413);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/profile/avatar',
      headers: { 'content-type': 'image/png' },
      payload: pngBytes(),
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('정적 서빙은 경로 조작과 미지원 확장자를 차단한다', async () => {
    const traversal = await app.inject({
      method: 'GET',
      url: '/uploads/avatars/..%2F..%2Fschema.prisma',
    });
    expect(traversal.statusCode).toBe(404);
    const txt = await app.inject({ method: 'GET', url: '/uploads/avatars/note.txt' });
    expect(txt.statusCode).toBe(404);
  });
});
