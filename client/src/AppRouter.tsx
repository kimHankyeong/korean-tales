/**
 * 최상위 화면 라우팅 — 인증 상태(authStore) → 로비/게임(roomStore.room.inGame) 순으로 전환한다.
 * REQUIRE_AUTH=true 배포에서는 로그인 성공 후에만 소켓을 연결해야 handshake가 통과한다.
 */

import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@korean-tales/shared';
import { AuthScreen } from './components/AuthScreen';
import { GameScreen } from './components/GameScreen';
import { LobbyFlow } from './components/LobbyFlow';
import { connectSocket, disconnectSocket } from './lib/socket';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { useRoomStore } from './store/roomStore';

export function AppRouter() {
  const status = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);
  const checkSession = useAuthStore((s) => s.checkSession);
  const room = useRoomStore((s) => s.room);
  const applyRoomState = useRoomStore((s) => s.applyRoomState);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const gameOverResult = useGameStore((s) => s.gameOverResult);

  useEffect(() => {
    void checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인 상태일 때만 소켓 연결 — REQUIRE_AUTH가 세션 쿠키를 요구한다
  useEffect(() => {
    if (status !== 'SIGNED_IN') return;
    const socket = connectSocket();

    function onRoomState(payload: Parameters<typeof applyRoomState>[0]) {
      applyRoomState(payload);
    }
    function onConnectError(err: Error) {
      if (err.message === 'UNAUTHORIZED') {
        disconnectSocket();
        signOut();
      }
    }

    socket.on(SOCKET_EVENTS.roomState, onRoomState);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off(SOCKET_EVENTS.roomState, onRoomState);
      socket.off('connect_error', onConnectError);
    };
  }, [status, applyRoomState, signOut]);

  useEffect(() => {
    if (status === 'SIGNED_OUT') {
      disconnectSocket();
      leaveRoom();
    }
  }, [status, leaveRoom]);

  if (status === 'CHECKING') {
    return <main className="grid h-screen place-items-center bg-slate-950 text-slate-400">불러오는 중…</main>;
  }
  if (status === 'SIGNED_OUT') return <AuthScreen />;

  // gameOverResult가 남아있는 동안은 방이 이미 inGame:false여도 결과 화면을 계속 보여준다
  // (그래야 "다시하기"를 누르기 전에 GameScreen이 먼저 사라지는 일이 없다)
  return room?.inGame || gameOverResult ? <GameScreen /> : <LobbyFlow />;
}
