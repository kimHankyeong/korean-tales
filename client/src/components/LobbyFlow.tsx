/**
 * 로그인 이후, 게임 중이 아닐 때의 화면 흐름 — 메뉴 → 공개방 목록 → 방 안.
 * roomStore.room이 있으면(방 소속 상태) view 값과 무관하게 방 안 화면을 보여준다 —
 * 게임 종료 후 "다시하기"가 같은 방으로 곧장 돌아가는 것도 이 규칙 덕분이다(AppRouter 참고).
 */

import { useState } from 'react';
import { useRoomStore } from '../store/roomStore';
import { LobbyMenuScreen } from './LobbyMenuScreen';
import { RoomBrowserScreen } from './RoomBrowserScreen';
import { RoomLobbyScreen } from './RoomLobbyScreen';

type View = 'MENU' | 'BROWSER';

export function LobbyFlow() {
  const room = useRoomStore((s) => s.room);
  const [view, setView] = useState<View>('MENU');

  if (room) return <RoomLobbyScreen />;
  if (view === 'BROWSER') return <RoomBrowserScreen onBack={() => setView('MENU')} />;
  return <LobbyMenuScreen onStart={() => setView('BROWSER')} />;
}
