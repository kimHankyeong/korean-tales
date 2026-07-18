/**
 * 인증 REST API — Bearer 토큰 기반 (requirements 11번).
 * POST /auth/signup · POST /auth/login · POST /auth/logout · GET /auth/me
 *
 * httpOnly 쿠키 대신 토큰을 응답 바디로 내려주고 클라이언트가 localStorage에 저장했다가
 * Authorization 헤더로 실어 보내는 방식. client/server가 서로 다른 Render 서브도메인이라
 * SameSite=None 쿠키가 iOS Safari·인앱 브라우저·일부 Android 브라우저에서 크로스사이트
 * 정책에 막혀 로그인 직후 로그인 화면으로 튕기는 문제가 있었다 — 쿠키를 아예 안 쓰면
 * 이 문제 자체가 사라진다.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthService } from './service';

/** Authorization: Bearer <token> 헤더에서 토큰을 추출 — profile/routes.ts도 재사용 */
export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

interface SignupBody {
  email?: string;
  password?: string;
  nickname?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  app.post<{ Body: SignupBody }>('/auth/signup', async (request, reply) => {
    const { email = '', password = '', nickname = '' } = request.body ?? {};
    const result = await auth.signup({ email, password, nickname });
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return reply.status(201).send({ user: result.user, token: result.token });
  });

  app.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const { email = '', password = '' } = request.body ?? {};
    const result = await auth.login({ email, password });
    if (!result.ok) return reply.status(401).send({ error: result.error });
    return reply.send({ user: result.user, token: result.token });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = bearerToken(request);
    if (token) await auth.logout(token);
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const token = bearerToken(request);
    const user = token ? await auth.validateSession(token) : null;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    return reply.send({ user });
  });
}
