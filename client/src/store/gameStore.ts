/**
 * 게임 화면 상태 스토어 (Zustand) — 지금은 목(mock) 데이터로 컴포넌트를 독립 구동한다.
 * 소켓 연동 세션에서 SOCKET_EVENTS 수신 핸들러가 이 스토어의 액션을 호출하는 구조로 확장 예정.
 */

import { create } from 'zustand';
import type {
  AdminRosterPayload,
  ChatMessagePayload,
  FlowerOptionsPayload,
  GameOverPayload,
  GameRolePayload,
  InvestigationPayload,
  PublicGameState,
  PublicPlayerState,
  SurrenderProgressPayload,
  TimerSyncPayload,
  VoteResultPayload,
} from '@korean-tales/shared';
import type { ChatMessageView } from '../components/ChatWindow';
import type { CountdownTarget } from '../components/CountdownText';
import { applyBgmVolume, loadBgmVolume } from '../lib/bgm';
import { formatSpeechOrderLabel, type PhaseKind } from '../lib/format';
import { playSfx } from '../lib/sfx';

let nextMessageId = 1;
const messageId = () => `m${nextMessageId++}`;
let nextAnnouncementId = 1;
let nextVoteResultId = 1;
let nextActionErrorId = 1;

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
  /** 관리자 전용 — 가상 플레이어를 포함한 전원의 배정 (13번 — 없으면 빈 배열) */
  adminRoster: AdminRosterPayload['players'];
  /**
   * 내가 다른 플레이어에게 붙인 "추측한 직업" 메모 아이콘(이모지) — 순수 클라이언트
   * 로컬 상태다. 서버에는 절대 보내지 않는다(추리는 본인만의 것). 새 게임 시작 시 초기화.
   */
  suspicionMarks: Record<string, string>;
  /**
   * 메모장 — 언제든 자유롭게 적어두는 개인 메모 줄들(10번 피드백). suspicionMarks와 같은 이유로
   * 순수 클라이언트 로컬 상태이며 서버에는 전송되지 않는다. 채팅으로 보낼 때만 그 내용을
   * sendChat 경로로 전송한다. 새 게임 시작 시 초기화.
   */
  memoLines: string[];
  /**
   * 화면 중앙 발표 문구 — 길동무 동반 사망·유서 대상 지목·구미호 유혹(game:announcement),
   * 투사 결과(gameInvestigation, 해태 본인에게만) 공용. 표시 시간은 문구마다 다를 수 있다
   * (예: 유혹 안내 3초, 나머지 4초). id는 같은 문구가 연속으로 와도 매번 새로 타이머가
   * 돌게 하기 위한 값.
   */
  announcement: { id: number; text: string; durationMs: number } | null;
  /**
   * 낮 처형 투표(재투표 포함) 종료 직후 3초간 표시할 투표 내역(game:voteResult, 9번 피드백).
   * id는 announcement와 같은 이유로 같은 내용이 연속으로 와도 타이머를 새로 걸기 위한 값.
   */
  voteResult: { id: number; votes: Record<string, string>; durationMs: number } | null;
  /**
   * 게임 액션이 서버 상태머신 guard에 조용히 거부됐을 때(ACTION_REJECTED) 짧게 보여줄
   * 오류 토스트 — 예전엔 아무 표시 없이 그냥 아무 일도 안 일어나 "눌렀는데 반영 안 됨"으로
   * 보였다. id는 같은 문구가 연속으로 와도 타이머를 새로 걸기 위한 값.
   */
  actionError: { id: number; text: string } | null;

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
  applyAdminRoster(payload: AdminRosterPayload): void;
  /** 추측 아이콘 설정 — emoji가 빈 문자열/null이면 지운다 */
  setSuspicionMark(playerId: string, emoji: string | null): void;
  /** 메모장에 새 줄 추가 (10번 피드백) */
  addMemoLine(text: string): void;
  /** 메모장 줄 삭제 */
  removeMemoLine(index: number): void;
  /** 메모장 줄 수정 — 빈 문자열이면 무시(삭제는 removeMemoLine으로) */
  updateMemoLine(index: number, text: string): void;
  /** 화면 중앙 발표 문구 표시(4초 뒤 자동으로 사라짐 — 실제 타이머는 컴포넌트가 관리) */
  setAnnouncement(text: string, durationMs?: number): void;
  clearAnnouncement(): void;
  /** 액션 반려 토스트 표시(2.5초 뒤 자동으로 사라짐 — 실제 타이머는 컴포넌트가 관리) */
  setActionError(text: string): void;
  clearActionError(): void;
  applyVoteResult(payload: VoteResultPayload): void;
  clearVoteResult(): void;

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
  adminRoster: [],
  suspicionMarks: {},
  memoLines: [],
  announcement: null,
  voteResult: null,
  actionError: null,

  setMyId: (id) => set({ myId: id }),

  setMyProfile: (profile) => set({ myProfile: profile }),

  // role·adminRoster는 여기서 초기화하지 않는다 — 서버가 game:role/admin:roster를
  // room:state보다 먼저 보내고, 이 리셋은 room:state 수신(=GameScreen 마운트) 이후에
  // 실행되므로 이미 도착한 값을 지워버리게 된다. 관리자가 시작한 게임은 매번 새
  // admin:roster를 보내주므로(가상 플레이어가 없어도) 다음 게임에서 자연히 갱신된다.
  // AppRouter.tsx 참고.
  resetForRealGame: () =>
    set({
      publicState: null,
      gameOverResult: null,
      lastInvestigation: null,
      surrenderProgress: null,
      flowerOptions: null,
      players: [],
      messages: [],
      condemnedId: null,
      timer: null,
      suspicionMarks: {},
      memoLines: [],
      announcement: null,
      voteResult: null,
    }),

  applyRole: (role) => set({ role }),

  applyAdminRoster: (payload) => set({ adminRoster: payload.players }),

  setSuspicionMark: (playerId, emoji) =>
    set((state) => {
      const next = { ...state.suspicionMarks };
      if (emoji) next[playerId] = emoji;
      else delete next[playerId];
      return { suspicionMarks: next };
    }),

  addMemoLine: (text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      return { memoLines: [...state.memoLines, trimmed] };
    }),
  removeMemoLine: (index) =>
    set((state) => ({ memoLines: state.memoLines.filter((_, i) => i !== index) })),
  updateMemoLine: (index, text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      return { memoLines: state.memoLines.map((line, i) => (i === index ? trimmed : line)) };
    }),

  setAnnouncement: (text, durationMs = 4000) =>
    set({ announcement: { id: nextAnnouncementId++, text, durationMs } }),
  clearAnnouncement: () => set({ announcement: null }),

  setActionError: (text) => set({ actionError: { id: nextActionErrorId++, text } }),
  clearActionError: () => set({ actionError: null }),

  applyVoteResult: (payload) =>
    set({
      voteResult: {
        id: nextVoteResultId++,
        votes: payload.votes,
        durationMs: payload.durationMs ?? 5000,
      },
    }),
  clearVoteResult: () => set({ voteResult: null }),

  applyGameState: (publicState) => {
    const prevPhasePath = get().publicState?.phase;
    set((state) => {
      const phase: PhaseKind = publicState.phase.startsWith('night') ? 'NIGHT' : 'DAY';
      // 최후의 변론·개인 발언 둘 다 "이 사람만 채팅 가능" 메커니즘을 공유한다 (ChatWindow)
      const condemnedId =
        publicState.phase === 'day.finalPlea'
          ? publicState.executionTargetId
          : publicState.phase === 'day.personalSpeech'
            ? publicState.currentSpeakerId
            : null;

      // 개인 발언 차례가 바뀔 때마다 발언 순서 안내 시스템 메시지 추가
      const prevPhase = state.publicState?.phase;
      const prevSpeakerId = prevPhase === 'day.personalSpeech' ? state.publicState!.currentSpeakerId : null;
      let messages = state.messages;
      if (
        publicState.phase === 'day.personalSpeech' &&
        publicState.currentSpeakerId &&
        publicState.currentSpeakerId !== prevSpeakerId
      ) {
        const seat = publicState.players.find((p) => p.id === publicState.currentSpeakerId)?.seat ?? 0;
        messages = [
          ...messages,
          {
            id: messageId(),
            kind: 'SYSTEM',
            text: formatSpeechOrderLabel(phase, state.personalSpeechSeconds, seat),
          },
        ];
      }

      // 개인 발언이 모두 끝나고 전체 토론으로 전환되는 순간 안내 (12번 피드백)
      if (publicState.phase === 'day.discussion' && prevPhase === 'day.personalSpeech') {
        messages = [...messages, { id: messageId(), kind: 'SYSTEM', text: '전체발언시간이 시작되었습니다.' }];
      }

      // 조언자 후보 개인 발언(어필)이 모두 끝나고 후보 전체 토론으로 전환되는 순간 안내
      if (publicState.phase === 'firstMorning.electionDiscussion' && prevPhase === 'firstMorning.appeal') {
        messages = [
          ...messages,
          { id: messageId(), kind: 'SYSTEM', text: '조언자 후보 전체 발언시간이 시작되었습니다.' },
        ];
      }

      // 최후의 발언(변론) 시작 안내 — 처형 확정자 번호 포함 (11번 피드백)
      if (publicState.phase === 'day.finalPlea' && prevPhase !== 'day.finalPlea') {
        const seat = publicState.players.find((p) => p.id === publicState.executionTargetId)?.seat;
        if (seat != null) {
          messages = [...messages, { id: messageId(), kind: 'SYSTEM', text: `${seat}번의 최후의 발언` }];
        }
      }

      return { publicState, phase, players: publicState.players, condemnedId, messages };
    });

    // 밤/낮 전환·투표 시작 효과음(10번 피드백) — 실제로 phase 문자열이 바뀐 순간에만 1회
    if (prevPhasePath !== publicState.phase) {
      if (publicState.phase.startsWith('night') && !prevPhasePath?.startsWith('night')) {
        playSfx('NIGHT');
      } else if (!publicState.phase.startsWith('night') && prevPhasePath?.startsWith('night')) {
        playSfx('DAY');
      }
      if (publicState.phase === 'day.vote' || publicState.phase === 'day.revote') {
        playSfx('VOTE');
      }
    }
  },

  applyGameOver: (gameOverResult) => set({ gameOverResult }),

  applyChatMessage: (payload) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: messageId(),
          kind: 'CHAT',
          senderId: payload.senderId,
          senderName: payload.channel === 'EVIL' ? `${payload.senderName} (악)` : payload.senderName,
          senderSeat: state.players.find((p) => p.id === payload.senderId)?.seat,
          text: payload.text,
        },
      ],
    })),

  applyTimerSync: (payload) =>
    set((state) => {
      const timer = { label: payload.phaseKey, endsAt: payload.endsAt, serverNow: payload.serverNow };
      // 조언자 후보 개인 발언(어필) 차례 안내 — PublicGameState에는 현재 발언자가 없어
      // (gamePrompts.ts 참고) 타이머 phaseKey("appeal:<playerId>")로만 판별할 수 있다
      let messages = state.messages;
      if (payload.phaseKey.startsWith('appeal:') && payload.phaseKey !== state.timer?.label) {
        const speakerId = payload.phaseKey.slice('appeal:'.length);
        const seat = state.players.find((p) => p.id === speakerId)?.seat;
        if (seat != null) {
          messages = [
            ...messages,
            { id: messageId(), kind: 'SYSTEM', text: `${seat}번 후보의 개인 발언 시간입니다.` },
          ];
        }
      }
      return { timer, messages };
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
          senderId: myId,
          senderName: me?.name ?? '나',
          senderSeat: me?.seat,
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
