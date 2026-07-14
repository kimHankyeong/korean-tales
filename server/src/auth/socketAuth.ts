/**
 * Socket.io 핸드셰이크 인증 — REST와 같은 httpOnly 세션 쿠키를 검증해
 * 소켓 연결을 계정과 연결한다 (requirements 11번: "Socket.io 연결 시에도 인증 토큰 검증").
 *
 * 게스트 분기 (requirements 9번 — 허용 여부 미정):
 * 신원은 SocketIdentity 판별 유니온 한 곳으로 수렴하므로, 게스트 정책이 확정되면
 * 이 파일의 requireAuth 분기만 바꾸면 된다. 현재 기본값은 게스트 허용.
 */

import type { Server, Socket } from 'socket.io';
import type { AuthService } from './service';
import { SESSION_COOKIE } from './routes';

export type SocketIdentity =
  | {
      kind: 'USER';
      userId: string;
      /** 게임 내 표시 이름 — 로그인 유저는 계정 닉네임을 강제 사용 */
      nickname: string;
      profileImageUrl: string | null;
    }
  | { kind: 'GUEST' }; // ⚠️ 게스트 허용 여부 미정 — 확정 시 이 분기에서 처리

/** socket.data에 신원을 보관하는 키 접근 헬퍼 */
export function identityOf(socket: Socket): SocketIdentity {
  return (socket.data as { identity?: SocketIdentity }).identity ?? { kind: 'GUEST' };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}

export interface SocketAuthOptions {
  /**
   * true면 미인증(게스트) 연결을 거부한다.
   * 기본값 false — 게스트 허용 (requirements 9번 미정 사항, REQUIRE_AUTH 환경변수로 전환)
   */
  requireAuth?: boolean;
}

/** io.use()에 등록하는 핸드셰이크 미들웨어 */
export function registerSocketAuth(
  io: Server,
  auth: AuthService,
  options: SocketAuthOptions = {},
): void {
  io.use((socket, next) => {
    void (async () => {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const user = token ? await auth.validateSession(token) : null;

      if (user) {
        (socket.data as { identity?: SocketIdentity }).identity = {
          kind: 'USER',
          userId: user.id,
          nickname: user.nickname,
          profileImageUrl: user.profileImageUrl,
        };
        return next();
      }

      if (options.requireAuth) {
        return next(new Error('UNAUTHORIZED')); // 게스트 차단 확정 시의 동작
      }
      (socket.data as { identity?: SocketIdentity }).identity = { kind: 'GUEST' };
      next();
    })().catch((error: unknown) => next(error instanceof Error ? error : new Error(String(error))));
  });
}
