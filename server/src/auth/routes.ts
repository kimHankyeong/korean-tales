/**
 * 인증 REST API — httpOnly 세션 쿠키 기반 (requirements 11번).
 * POST /auth/signup · POST /auth/login · POST /auth/logout · GET /auth/me
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { AuthService, SESSION_TTL_MS } from './service';

/** 세션 쿠키 이름 — Socket.io 핸드셰이크(socketAuth.ts)도 같은 쿠키를 읽는다 */
export const SESSION_COOKIE = 'kt_session';

function setSessionCookie(reply: FastifyReply, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, // JS 접근 불가 — XSS로 토큰 탈취 방지
    // 배포 환경은 client/server가 서로 다른 오리진(Render 서브도메인)이라 크로스 사이트 요청 —
    // SameSite=Lax는 크로스 사이트 XHR/소켓 요청에 쿠키를 실어 보내지 않아 로그인 직후 소켓
    // 핸드셰이크가 UNAUTHORIZED로 거부된다. None은 Secure 필수라 로컬 개발(http)에서는 Lax 유지.
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    secure: isProduction,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
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
    setSessionCookie(reply, result.token); // 가입 즉시 로그인
    return reply.status(201).send({ user: result.user });
  });

  app.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const { email = '', password = '' } = request.body ?? {};
    const result = await auth.login({ email, password });
    if (!result.ok) return reply.status(401).send({ error: result.error });
    setSessionCookie(reply, result.token);
    return reply.send({ user: result.user });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const user = token ? await auth.validateSession(token) : null;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    return reply.send({ user });
  });
}
