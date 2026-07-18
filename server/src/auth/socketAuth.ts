/**
 * Socket.io 핸드셰이크 인증 — REST와 같은 Bearer 토큰을 검증해 소켓을 계정과 연결한다
 * (requirements 11번: "Socket.io 연결 시에도 인증 토큰 검증").
 * 토큰은 쿠키가 아니라 Socket.io 표준 `auth` 핸드셰이크 페이로드(`socket.handshake.auth.token`)로
 * 전달된다 — client/server가 서로 다른 오리진이라 쿠키 기반이면 크로스사이트 정책에 막힐 수 있다.
 *
 * 게스트 분기 (requirements 9번 — 허용 여부 미정):
 * 신원은 SocketIdentity 판별 유니온 한 곳으로 수렴하므로, 게스트 정책이 확정되면
 * 이 파일의 requireAuth 분기만 바꾸면 된다. 현재 기본값은 게스트 허용.
 */

import type { Server, Socket } from 'socket.io';
import type { AuthService } from './service';
import { isAdminEmail } from './admin';

export type SocketIdentity =
  | {
      kind: 'USER';
      userId: string;
      /** 게임 내 표시 이름 — 로그인 유저는 계정 닉네임을 강제 사용 */
      nickname: string;
      profileImageUrl: string | null;
      /** ADMIN_EMAILS 환경변수에 계정 이메일이 있으면 true (13번 — 정원 미달 시작 등 관리자 전용 기능) */
      isAdmin: boolean;
    }
  | { kind: 'GUEST' }; // ⚠️ 게스트 허용 여부 미정 — 확정 시 이 분기에서 처리

/** socket.data에 신원을 보관하는 키 접근 헬퍼 */
export function identityOf(socket: Socket): SocketIdentity {
  return (socket.data as { identity?: SocketIdentity }).identity ?? { kind: 'GUEST' };
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
      const token = socket.handshake.auth?.token as string | undefined;
      const user = token ? await auth.validateSession(token) : null;

      if (user) {
        (socket.data as { identity?: SocketIdentity }).identity = {
          kind: 'USER',
          userId: user.id,
          nickname: user.nickname,
          profileImageUrl: user.profileImageUrl,
          isAdmin: isAdminEmail(user.email),
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
