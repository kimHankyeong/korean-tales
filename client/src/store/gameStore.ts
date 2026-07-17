/**
 * 게임 화면 상태 스토어 (Zustand) — 지금은 목(mock) 데이터로 컴포넌트를 독립 구동한다.
 * 소켓 연동 세션에서 SOCKET_EVENTS 수신 핸들러가 이 스토어의 액션을 호출하는 구조로 확장 예정.
 */

import { create } from 'zustand';
import type {
  ChatMessagePayload,
  FlowerOptionsPayload,
  GameOverPayload,
  GameRolePayload,
  InvestigationPayload,
  PublicGameState,
  PublicPlayerState,
  SurrenderProgressPayload,
  TimerSyncPayload,
} from '@korean-tales/shared';
import type { ChatMessageView } from '../components/ChatWindow';
import type { CountdownTarget } from '../components/CountdownText';
import { applyBgmVolume, loadBgmVolume } from '../lib/bgm';
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
  /** 내 계정 프로필 (마이페이지) — 소켓 연동 시 /auth/me 결과로 대체 */
  myProfile: { nickname: string; profileImageUrl: string | null };
  /** 배경음악 음량 (0~1) — localStorage에 유지 */
  bgmVolume: number;
  /** 서버 공개 게임 상태 원본 — resolveActivePrompt가 참고 (게임 미시작 시 null) */
  publicState: PublicGameState | null;
  /** 본인 캐릭터 배정 — game:role은 본인 소켓에만 전송됨 */
  role: GameRolePayload | null;
  /** 게임 종료 결과 — game:over 수신 시 역할 전체 공개 */
  gameOverResult: GameOverPayload | null;
  /** 해태 본인에게만 오는 최근 투사 결과 */
  lastInvestigation: InvestigationPayload | null;
  /** 같은 팀에게만 오는 투항 진행 상황 */
  surrenderProgress: SurrenderProgressPayload | null;
  /** 자청비 본인에게만 오는 부활꽃 대상 후보 */
  flowerOptions: FlowerOptionsPayload | null;

  setMyId(id: string): void;
  setMyProfile(profile: { nickname: string; profileImageUrl: string | null }): void;
  /** 로비→게임 진입 시 데모/이전 게임 잔여 상태 제거 */
  resetForRealGame(): void;
  applyRole(payload: GameRolePayload): void;
  applyGameState(payload: PublicGameState): void;
  applyGameOver(payload: GameOverPayload): void;
  applyChatMessage(payload: ChatMessagePayload): void;
  applyTimerSync(payload: TimerSyncPayload): void;
  clearTimer(): void;
  applyInvestigation(payload: InvestigationPayload): void;
  applySurrenderProgress(payload: SurrenderProgressPayload | null): void;
  applyFlowerOptions(payload: FlowerOptionsPayload | null): void;

  setPhase(phase: PhaseKind): void;
  setCondemned(id: string | null): void;
  startTimer(label: string, seconds: number): void;
  sendChat(text: string): void;
  addSystemMessage(text: string): void;
  /** 발언 순서 시스템 메시지: `(해)낮-80초-1번` */
  announceSpeaker(seat: number): void;
  /** 마이페이지: 닉네임 변경 — 내 플레이어 표시 이름에도 반영 */
  setMyNickname(nickname: string): void;
  /** 마이페이지: 프로필 사진 변경 — 게임 내 프로필 표시에도 반영 */
  setMyAvatarUrl(url: string | null): void;
  /** 마이페이지: 배경음악 음량 조절 (0~1) — 즉시 반영 + 저장 */
  setBgmVolume(volume: number): void;
}

/** 목 데이터 — 9인 방 가정 */
const MOCK_PLAYERS: PublicPlayerState[] = Array.from({ length: 9 }, (_, i) => ({
  id: `p${i + 1}`,
  name: ['달래', '바우', '초롱', '무영', '가람', '소소', '한별', '누리', '재이'][i]!,
  seat: i + 1,
  alive: i !== 4, // 5번은 사망자 예시
  avatarUrl: null, // 미설정 → 기본 아바타
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
  myProfile: { nickname: '달래', profileImageUrl: null },
  bgmVolume: loadBgmVolume(),
  publicState: null,
  role: null,
  gameOverResult: null,
  lastInvestigation: null,
  surrenderProgress: null,
  flowerOptions: null,

  setMyId: (id) => set({ myId: id }),

  setMyProfile: (profile) => set({ myProfile: profile }),

  resetForRealGame: () =>
    set({
      publicState: null,
      role: null,
      gameOverResult: null,
      lastInvestigation: null,
      surrenderProgress: null,
      flowerOptions: null,
      players: [],
      messages: [],
      condemnedId: null,
      timer: null,
    }),

  applyRole: (role) => set({ role }),

  applyGameState: (publicState) =>
    set({
      publicState,
      phase: publicState.phase.startsWith('night') ? 'NIGHT' : 'DAY',
      players: publicState.players,
      condemnedId: publicState.phase === 'day.finalPlea' ? publicState.executionTargetId : null,
    }),

  applyGameOver: (gameOverResult) => set({ gameOverResult }),

  applyChatMessage: (payload) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: messageId(),
          kind: 'CHAT',
          senderName: payload.channel === 'EVIL' ? `${payload.senderName} (악)` : payload.senderName,
          text: payload.text,
        },
      ],
    })),

  applyTimerSync: (payload) =>
    set({
      timer: { label: payload.phaseKey, endsAt: payload.endsAt, serverNow: payload.serverNow },
    }),

  clearTimer: () => set({ timer: null }),

  applyInvestigation: (lastInvestigation) => set({ lastInvestigation }),

  applySurrenderProgress: (surrenderProgress) => set({ surrenderProgress }),

  applyFlowerOptions: (flowerOptions) => set({ flowerOptions }),

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
    const { players, myId, messages, myProfile } = get();
    const me = players.find((p) => p.id === myId);
    set({
      messages: [
        ...messages,
        {
          id: messageId(),
          kind: 'CHAT',
          senderName: me?.name ?? '나',
          senderAvatarUrl: myProfile.profileImageUrl,
          text,
        },
      ],
    });
  },

  addSystemMessage: (text) =>
    set((state) => ({ messages: [...state.messages, { id: messageId(), kind: 'SYSTEM', text }] })),

  announceSpeaker: (seat) => {
    const { phase, personalSpeechSeconds } = get();
    get().addSystemMessage(formatSpeechOrderLabel(phase, personalSpeechSeconds, seat));
  },

  setMyNickname: (nickname) =>
    set((state) => ({
      myProfile: { ...state.myProfile, nickname },
      players: state.players.map((p) => (p.id === state.myId ? { ...p, name: nickname } : p)),
    })),

  setMyAvatarUrl: (url) =>
    set((state) => ({
      myProfile: { ...state.myProfile, profileImageUrl: url },
      players: state.players.map((p) => (p.id === state.myId ? { ...p, avatarUrl: url } : p)),
    })),

  setBgmVolume: (volume) => {
    applyBgmVolume(volume); // 재생 중 즉시 반영 + localStorage 저장
    set({ bgmVolume: volume });
  },
}));
