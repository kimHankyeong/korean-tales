/**
 * Fastify 앱 팩토리 — REST(인증)와 헬스체크를 구성한다.
 * index.ts(실서버)와 테스트(inject)가 같은 앱을 공유한다.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerAuthRoutes } from './auth/routes';
import type { AuthService } from './auth/service';
import type { HistoryService } from './history/service';
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
  /** 지정하면 GET /profile/history(최근 전적, 2번 항목)가 활성화된다 */
  history?: HistoryService;
}

export async function createApp(
  auth: AuthService,
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify();
  const uploadsDir = options.uploadsDir ?? process.env.UPLOADS_DIR ?? './uploads';

  // Authorization 헤더로 인증하므로 쿠키 플러그인/CORS credentials가 필요 없다
  await app.register(cors, { origin: corsOrigin() });

  registerAuthRoutes(app, auth);
  registerProfileRoutes(app, auth, { uploadsDir, history: options.history });

  // Render 헬스체크 경로 (render.yaml healthCheckPath)
  app.get('/health', async () => ({ ok: true }));

  return app;
}
