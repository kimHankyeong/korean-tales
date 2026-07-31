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

/** 서버 ack가 이 시간 안에 안 오면 "시간 초과"로 간주하고 포기한다 (아래 emitWithAck 참고) */
const ACK_TIMEOUT_MS = 8000;

/**
 * ack 콜백이 있는 이벤트용 — payload가 없는 이벤트는 인자 생략.
 * 예전엔 타임아웃이 전혀 없어서, 재접속 중이거나 패킷이 유실돼 ack가 끝내 안 오면 이
 * Promise가 영원히 pending 상태로 남았다 — "투표하기를 눌렀는데 반영이 안 됐다"처럼
 * 버튼을 눌러도 성공도 실패도 아닌 채 아무 반응이 없는 것처럼 보이는 원인이었다.
 * socket.io-client의 .timeout()으로 일정 시간 뒤 { ok: false, error: 'TIMEOUT' }으로
 * 확정 응답을 만들어, 호출부(reportIfRejected 등)가 사용자에게 실패를 알리고 다시
 * 시도하도록 유도할 수 있게 한다.
 */
export function emitWithAck<TResponse extends { ok: boolean; error?: string }>(
  event: string,
  ...payload: unknown[]
): Promise<TResponse> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(ACK_TIMEOUT_MS)
      .emit(event, ...payload, (err: Error | null, response: TResponse) => {
        resolve(err ? ({ ok: false, error: 'TIMEOUT' } as TResponse) : response);
      });
  });
}
