/**
 * Socket.io 연결 — server/src/auth/socketAuth.ts가 handshake의 `auth.token`(Bearer 토큰)으로
 * 인증한다. 쿠키가 아니라 Socket.io 표준 auth 페이로드로 넘기므로 client/server가 다른
 * 오리진이어도 크로스사이트 쿠키 정책의 영향을 받지 않는다 (lib/authToken.ts 참고).
 * REQUIRE_AUTH=true 배포에서는 로그인(토큰 확보) 이후에만 connectSocket()을 호출해야 한다.
 */

import { io, type Socket } from 'socket.io-client';
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

/** ack 콜백이 있는 이벤트용 — payload가 없는 이벤트는 인자 생략 */
export function emitWithAck<TResponse>(event: string, ...payload: unknown[]): Promise<TResponse> {
  return new Promise((resolve) => {
    getSocket().emit(event, ...payload, (response: TResponse) => resolve(response));
  });
}
