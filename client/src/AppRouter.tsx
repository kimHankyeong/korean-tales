/**
 * 최상위 화면 라우팅 — 인증 상태(authStore) → 로비/게임(roomStore.room.inGame) 순으로 전환한다.
 * REQUIRE_AUTH=true 배포에서는 로그인 성공 후에만 소켓을 연결해야 handshake가 통과한다.
 */

import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@korean-tales/shared';
import { AuthScreen } from './components/AuthScreen';
import { GameScreen } from './components/GameScreen';
import { LobbyFlow } from './components/LobbyFlow';
import { initBgm } from './lib/bgm';
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
    // 로그인 화면부터 배경음악 시작 — 게임 시작 전까지는 아무 화면도 initBgm을 호출하지 않았음
    initBgm(useGameStore.getState().bgmVolume);
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
    // 방장에게 강퇴당함 — 즉시 로비로 돌려보낸다
    function onKicked() {
      leaveRoom();
    }

    socket.on(SOCKET_EVENTS.roomState, onRoomState);
    socket.on('connect_error', onConnectError);
    socket.on(SOCKET_EVENTS.roomKicked, onKicked);

    // 게임 이벤트 구독은 GameScreen이 아니라 여기(항상 마운트돼 있는 라우터)에 둔다 —
    // 서버는 게임 시작 시 game:role을 room:state보다 먼저 보내는데, GameScreen은
    // room.inGame이 true로 바뀐 뒤에야(=room:state 수신 이후) 마운트되므로, 리스너를
    // GameScreen에 등록하면 room:state보다 먼저 도착하는 game:role을 놓쳐 직업을
    // 영원히 확인할 수 없는 문제가 있었다(game:state는 페이즈마다 재전송돼 자연 복구되지만
    // game:role은 1회성이라 복구되지 않음).
    const {
      applyRole,
      applyGameState,
      applyGameOver,
      applyChatMessage,
      applyTimerSync,
      clearTimer,
      applyInvestigation,
      applySurrenderProgress,
      applyFlowerOptions,
      applyAdminRoster,
      addSystemMessage,
      setAnnouncement,
      applyVoteResult,
    } = useGameStore.getState();

    // 해태 본인에게만 오는 투사 결과 — "n번은 악 진영입니다/아닙니다" 형식으로 화면
    // 중앙 4초 발표 + 채팅 로그 둘 다에 남긴다 (13번)
    const onInvestigation: Parameters<typeof socket.on>[1] = (payload) => {
      applyInvestigation(payload);
      const seat = useGameStore.getState().players.find((p) => p.id === payload.targetId)?.seat;
      const text = `${seat ?? '?'}번은 악 진영${payload.result === 'EVIL' ? '입니다' : '이 아닙니다'}`;
      addSystemMessage(text);
      setAnnouncement(text);
    };

    // 길동무 동반 사망·유서 대상 지목·구미호 유혹 등 방 전체 공개 발표 문구 — 화면 중앙
    const onAnnouncement: Parameters<typeof socket.on>[1] = (payload: { text: string; durationMs?: number }) => {
      setAnnouncement(payload.text, payload.durationMs);
    };

    socket.on(SOCKET_EVENTS.gameRole, applyRole);
    socket.on(SOCKET_EVENTS.gameState, applyGameState);
    socket.on(SOCKET_EVENTS.gameOver, applyGameOver);
    socket.on(SOCKET_EVENTS.chatMessage, applyChatMessage);
    socket.on(SOCKET_EVENTS.timerSync, applyTimerSync);
    socket.on(SOCKET_EVENTS.timerClear, clearTimer);
    socket.on(SOCKET_EVENTS.gameInvestigation, onInvestigation);
    socket.on(SOCKET_EVENTS.surrenderProgress, applySurrenderProgress);
    socket.on(SOCKET_EVENTS.gameFlowerOptions, applyFlowerOptions);
    socket.on(SOCKET_EVENTS.adminRoster, applyAdminRoster);
    socket.on(SOCKET_EVENTS.gameAnnouncement, onAnnouncement);
    socket.on(SOCKET_EVENTS.gameVoteResult, applyVoteResult);

    return () => {
      socket.off(SOCKET_EVENTS.roomState, onRoomState);
      socket.off('connect_error', onConnectError);
      socket.off(SOCKET_EVENTS.roomKicked, onKicked);
      socket.off(SOCKET_EVENTS.gameRole, applyRole);
      socket.off(SOCKET_EVENTS.gameState, applyGameState);
      socket.off(SOCKET_EVENTS.gameOver, applyGameOver);
      socket.off(SOCKET_EVENTS.chatMessage, applyChatMessage);
      socket.off(SOCKET_EVENTS.timerSync, applyTimerSync);
      socket.off(SOCKET_EVENTS.timerClear, clearTimer);
      socket.off(SOCKET_EVENTS.gameInvestigation, onInvestigation);
      socket.off(SOCKET_EVENTS.surrenderProgress, applySurrenderProgress);
      socket.off(SOCKET_EVENTS.gameFlowerOptions, applyFlowerOptions);
      socket.off(SOCKET_EVENTS.adminRoster, applyAdminRoster);
      socket.off(SOCKET_EVENTS.gameAnnouncement, onAnnouncement);
      socket.off(SOCKET_EVENTS.gameVoteResult, applyVoteResult);
    };
  }, [status, applyRoomState, signOut, leaveRoom]);

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
