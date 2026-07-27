/**
 * Socket.io 연결 — server/src/auth/socketAuth.ts가 handshake의 `auth.token`(Bearer 토큰)으로
 * 인증한다. 쿠키가 아니라 Socket.io 표준 auth 페이로드로 넘기므로 client/server가 다른
 * 오리진이어도 크로스사이트 쿠키 정책의 영향을 받지 않는다 (lib/authToken.ts 참고).
 * REQUIRE_AUTH=true 배포에서는 로그인(토큰 확보) 이후에만 connectSocket()을 호출해야 한다.
 */

import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { getToken } from './authToken';
import { SERVER_URL } from './serverUrl';

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(SERVER_URL, {
    autoConnect: false,
    // 함수 형태 — 재연결마다 호출되어 항상 최신 토큰을 실어 보낸다
    auth: (cb) => cb({ token: getToken() }),
  });
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

/**
 * 서버가 이 소켓에 부여한 방/게임 내 playerId — server/src/socket/registerHandlers.ts의
 * stablePlayerId()와 동일한 규칙이다: 로그인 유저는 계정 id(`acct:<userId>`)로 고정되고
 * (재접속해도 같은 사람으로 인식되도록, 1번 섹션), 게스트는 현재 소켓 id를 그대로 쓴다.
 * room:state의 내 항목·발언 순서(currentSpeakerId) 등 서버가 보내는 모든 식별자와
 * 비교할 "내 id"는 반드시 이 함수로 구해야 한다 — getSocket().id를 직접 쓰면 로그인
 * 유저의 경우 서버 쪽 id와 어긋난다.
 */
export function myPlayerId(): string {
  const user = useAuthStore.getState().user;
  return user ? `acct:${user.id}` : (getSocket().id ?? '');
}

/** ack 콜백이 있는 이벤트용 — payload가 없는 이벤트는 인자 생략 */
export function emitWithAck<TResponse>(event: string, ...payload: unknown[]): Promise<TResponse> {
  return new Promise((resolve) => {
    getSocket().emit(event, ...payload, (response: TResponse) => resolve(response));
  });
}
