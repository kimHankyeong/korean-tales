/**
 * 마이페이지 API — requirements 11번.
 * - PATCH /profile/nickname: 닉네임 변경
 * - POST  /profile/avatar:  프로필 사진 업로드 (raw 이미지 바디, 서버측 형식·용량 재검증)
 * - GET   /uploads/avatars/:file: 정적 서빙 (추후 S3류 스토리지 이관 가능하도록
 *   저장·서빙이 이 파일에만 격리되어 있다)
 *
 * 저장 경로는 UPLOADS_DIR 환경변수(기본 ./uploads) — Render에서는 영구 디스크
 * 하위(/data/uploads)를 가리키게 한다.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService, AuthUser } from '../auth/service';
import { bearerToken } from '../auth/routes';
import type { HistoryService } from '../history/service';
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
  avatarFileName,
  sniffImageType,
  type AvatarImageType,
} from './avatar';

async function currentUser(request: FastifyRequest, auth: AuthService): Promise<AuthUser | null> {
  const token = bearerToken(request);
  return token ? auth.validateSession(token) : null;
}

export interface ProfileRoutesOptions {
  uploadsDir: string;
  /** 지정하면 GET /profile/history(최근 전적)가 활성화된다 */
  history?: HistoryService;
}

export function registerProfileRoutes(
  app: FastifyInstance,
  auth: AuthService,
  options: ProfileRoutesOptions,
): void {
  const avatarsDir = path.join(options.uploadsDir, 'avatars');

  // raw 이미지 바디 파서 — 허용 MIME만, Buffer 그대로 받는다
  app.addContentTypeParser(
    Object.keys(AVATAR_MIME_TYPES),
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  /* 닉네임 변경 */
  app.patch<{ Body: { nickname?: string } }>('/profile/nickname', async (request, reply) => {
    const user = await currentUser(request, auth);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const result = await auth.updateNickname(user.id, String(request.body?.nickname ?? ''));
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return reply.send({ user: result.user });
  });

  /* 최근 전적 (2번 항목) — 최신 판부터 최대 3개, 좌석·직업·닉네임·승패 포함 */
  app.get('/profile/history', async (request, reply) => {
    const user = await currentUser(request, auth);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!options.history) return reply.send({ matches: [] });
    const matches = await options.history.getRecentMatches(user.id, 3);
    return reply.send({ matches });
  });

  /* 비밀번호 변경 */
  app.patch<{ Body: { currentPassword?: string; newPassword?: string } }>(
    '/profile/password',
    async (request, reply) => {
      const user = await currentUser(request, auth);
      if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
      const result = await auth.updatePassword(
        user.id,
        String(request.body?.currentPassword ?? ''),
        String(request.body?.newPassword ?? ''),
      );
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.send({ ok: true });
    },
  );

  /* 프로필 사진 업로드 — 클라이언트가 256×256으로 리사이즈해 보낸 raw 이미지 */
  app.post(
    '/profile/avatar',
    // 2MB 제한 + 약간의 여유. 초과 시 Fastify가 413을 반환한다
    { bodyLimit: MAX_AVATAR_BYTES + 1024 },
    async (request, reply) => {
      const user = await currentUser(request, auth);
      if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

      const body = request.body;
      if (!Buffer.isBuffer(body)) {
        return reply.status(415).send({ error: 'UNSUPPORTED_TYPE' }); // 허용 MIME 아님
      }
      if (body.length === 0 || body.length > MAX_AVATAR_BYTES) {
        return reply.status(413).send({ error: 'TOO_LARGE' });
      }

      // 서버측 재검증 — Content-Type이 아니라 파일 시그니처로 실제 형식 판별 (11번)
      const actualType = sniffImageType(body);
      if (!actualType) return reply.status(400).send({ error: 'INVALID_IMAGE' });

      await mkdir(avatarsDir, { recursive: true });
      const fileName = avatarFileName(user.id, actualType);
      await writeFile(path.join(avatarsDir, fileName), body);

      // 형식이 바뀐 경우 이전 확장자 파일 정리
      for (const staleType of Object.keys(AVATAR_CONTENT_TYPES) as AvatarImageType[]) {
        if (staleType !== actualType) {
          await rm(path.join(avatarsDir, avatarFileName(user.id, staleType)), { force: true });
        }
      }

      // 캐시 무효화를 위해 버전 쿼리 부착 — 클라이언트는 SERVER_URL 기준으로 해석
      const url = `/uploads/avatars/${fileName}?v=${Date.now()}`;
      const updated = await auth.updateAvatarUrl(user.id, url);
      return reply.send({ user: updated });
    },
  );

  /* 아바타 정적 서빙 */
  app.get<{ Params: { file: string } }>('/uploads/avatars/:file', async (request, reply) => {
    // 경로 조작 방지 — 파일명만 허용
    const fileName = path.basename(request.params.file);
    const extension = path.extname(fileName).slice(1) as AvatarImageType;
    const contentType = AVATAR_CONTENT_TYPES[extension];
    if (!contentType) return reply.status(404).send({ error: 'NOT_FOUND' });

    try {
      const data = await readFile(path.join(avatarsDir, fileName));
      return reply.header('cache-control', 'public, max-age=86400').type(contentType).send(data);
    } catch {
      return reply.status(404).send({ error: 'NOT_FOUND' });
    }
  });
}
