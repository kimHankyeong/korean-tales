/**
 * Socket.io 연결 — server/src/auth/socketAuth.ts가 handshake의 httpOnly 세션 쿠키(kt_session)로
 * 인증하므로 withCredentials만 켜면 되고, 별도 토큰을 auth 옵션으로 넘길 필요는 없다.
 * REQUIRE_AUTH=true 배포에서는 로그인(세션 쿠키 확보) 이후에만 connectSocket()을 호출해야 한다.
 */

import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from './serverUrl';

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(SERVER_URL, { withCredentials: true, autoConnect: false });
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
