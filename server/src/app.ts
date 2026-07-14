/**
 * Fastify 앱 팩토리 — REST(인증)와 헬스체크를 구성한다.
 * index.ts(실서버)와 테스트(inject)가 같은 앱을 공유한다.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { registerAuthRoutes } from './auth/routes';
import type { AuthService } from './auth/service';

export async function createApp(auth: AuthService): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(cookie);
  await app.register(cors, {
    origin: true, // 개발용 — 배포 시 클라이언트 도메인으로 제한
    credentials: true, // httpOnly 세션 쿠키 전송 허용
  });

  registerAuthRoutes(app, auth);

  // Render 헬스체크 경로 (render.yaml healthCheckPath)
  app.get('/health', async () => ({ ok: true }));

  return app;
}
