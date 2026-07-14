/**
 * 게임 화면 상태 스토어 (Zustand) — 지금은 목(mock) 데이터로 컴포넌트를 독립 구동한다.
 * 소켓 연동 세션에서 SOCKET_EVENTS 수신 핸들러가 이 스토어의 액션을 호출하는 구조로 확장 예정.
 */

import { create } from 'zustand';
import type { PublicPlayerState } from '@korean-tales/shared';
import type { ChatMessageView } from '../components/ChatWindow';
import type { CountdownTarget } from '../components/CountdownText';
import { formatSpeechOrderLabel, type PhaseKind } from '../lib/format';

let nextMessageId = 1;
const messageId = () => `m${nextMessageId++}`;

export interface GameUiState {
  myId: string;
  phase: PhaseKind;
  players: PublicPlayerState[];
  messages: ChatMessageView[];
  /** 최후의 변론 대상 — 있으면 그 사람만 채팅 입력 가능 */
  condemnedId: string | null;
  timer: CountdownTarget | null;
  /** 방 옵션: 개인 발언시간 (발언 순서 표시 포맷에 사용) */
  personalSpeechSeconds: number;

  setPhase(phase: PhaseKind): void;
  setCondemned(id: string | null): void;
  startTimer(label: string, seconds: number): void;
  sendChat(text: string): void;
  addSystemMessage(text: string): void;
  /** 발언 순서 시스템 메시지: `(해)낮-80초-1번` */
  announceSpeaker(seat: number): void;
}

/** 목 데이터 — 9인 방 가정 */
const MOCK_PLAYERS: PublicPlayerState[] = Array.from({ length: 9 }, (_, i) => ({
  id: `p${i + 1}`,
  name: ['달래', '바우', '초롱', '무영', '가람', '소소', '한별', '누리', '재이'][i]!,
  seat: i + 1,
  alive: i !== 4, // 5번은 사망자 예시
}));

export const useGameStore = create<GameUiState>((set, get) => ({
  myId: 'p1',
  phase: 'DAY',
  players: MOCK_PLAYERS,
  messages: [
    { id: messageId(), kind: 'SYSTEM', text: '게임이 시작되었습니다.' },
    { id: messageId(), kind: 'CHAT', senderName: '바우', text: '다들 잘 부탁드립니다!' },
  ],
  condemnedId: null,
  timer: null,
  personalSpeechSeconds: 80,

  setPhase: (phase) => {
    set({ phase });
    get().addSystemMessage(phase === 'DAY' ? '낮이 되었습니다.' : '밤이 찾아왔습니다.');
  },

  setCondemned: (condemnedId) => set({ condemnedId }),

  startTimer: (label, seconds) =>
    set({
      timer: { label, endsAt: Date.now() + seconds * 1000, serverNow: Date.now() },
    }),

  sendChat: (text) => {
    const { players, myId, messages } = get();
    const me = players.find((p) => p.id === myId);
    set({
      messages: [
        ...messages,
        { id: messageId(), kind: 'CHAT', senderName: me?.name ?? '나', text },
      ],
    });
  },

  addSystemMessage: (text) =>
    set((state) => ({ messages: [...state.messages, { id: messageId(), kind: 'SYSTEM', text }] })),

  announceSpeaker: (seat) => {
    const { phase, personalSpeechSeconds } = get();
    get().addSystemMessage(formatSpeechOrderLabel(phase, personalSpeechSeconds, seat));
  },
}));
