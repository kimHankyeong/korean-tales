/**
 * Fastify 앱 팩토리 — REST(인증)와 헬스체크를 구성한다.
 * index.ts(실서버)와 테스트(inject)가 같은 앱을 공유한다.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { registerAuthRoutes } from './auth/routes';
import type { AuthService } from './auth/service';
import { registerProfileRoutes } from './profile/routes';

/**
 * CORS 허용 오리진 — CLIENT_ORIGIN 환경변수(쉼표 구분)로 제한.
 * 미설정 시 모든 오리진 반사(개발용). 배포 시 반드시 클라이언트 도메인을 지정할 것.
 */
export function corsOrigin(): string[] | true {
  const raw = process.env.CLIENT_ORIGIN?.trim();
  if (!raw) return true;
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export interface CreateAppOptions {
  /** 아바타 업로드 저장 경로 — 기본 UPLOADS_DIR 환경변수 또는 ./uploads */
  uploadsDir?: string;
}

export async function createApp(
  auth: AuthService,
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify();
  const uploadsDir = options.uploadsDir ?? process.env.UPLOADS_DIR ?? './uploads';

  await app.register(cookie, {
    // 선택: 쿠키 서명 시크릿 — 세션 토큰 자체가 불투명 랜덤 값이라 필수는 아니지만,
    // 설정하면 쿠키 변조 감지가 한 겹 추가된다 (.env.example의 COOKIE_SECRET)
    secret: process.env.COOKIE_SECRET,
  });
  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true, // httpOnly 세션 쿠키 전송 허용
  });

  registerAuthRoutes(app, auth);
  registerProfileRoutes(app, auth, { uploadsDir });

  // Render 헬스체크 경로 (render.yaml healthCheckPath)
  app.get('/health', async () => ({ ok: true }));

  return app;
}
