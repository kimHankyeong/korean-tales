/**
 * korean_tales 게임 서버 — Fastify(REST 인증) + Socket.io(실시간 게임).
 *
 * - 인증: httpOnly 세션 쿠키 (REST와 Socket.io 핸드셰이크가 같은 세션을 공유)
 * - DB: SQLite + Prisma — 파일 경로는 DATABASE_URL 환경변수 (.env.example 참고)
 * - 게임 규칙은 docs/requirements.md가 원본, 이벤트 계약은 shared/src/socket/events.ts
 */

import { Server } from 'socket.io';
import { CHARACTERS } from '@korean-tales/shared';
import { corsOrigin, createApp } from './app';
import { AuthService } from './auth/service';
import { prisma } from './db';
import { registerHandlers } from './socket/registerHandlers';

const PORT = Number(process.env.PORT ?? 4000);
// 게스트 허용 여부는 requirements 9번 미정 — 기본 허용, 확정 시 REQUIRE_AUTH=true
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

const auth = new AuthService(prisma);
const app = await createApp(auth);
await app.ready();

const io = new Server(app.server, {
  // REST와 동일한 CORS 정책 — CLIENT_ORIGIN 환경변수로 도메인 제한
  cors: { origin: corsOrigin(), credentials: true },
});
registerHandlers(io, Math.random, { auth, requireAuth: REQUIRE_AUTH });

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(
  `korean_tales server listening on :${PORT} (characters loaded: ${CHARACTERS.length}, requireAuth: ${REQUIRE_AUTH})`,
);
