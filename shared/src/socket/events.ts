/**
 * Socket.io 이벤트 이름·페이로드 계약 — client/server 공용.
 *
 * 정보 은닉 원칙 (requirements 기반):
 * - 캐릭터 배정(gameRole)은 본인 소켓에만 전송된다 — 남의 직업은 절대 알 수 없음
 * - 공개 게임 상태(gameState)에는 캐릭터/진영/밤 행동 정보가 포함되지 않는다
 * - 해태 투사 결과(gameInvestigation)는 해태 본인에게만 전송
 * - 악 진영 채널(chat channel 'EVIL')은 악 진영 생존자에게만 중계 (밤 토론)
 * - 투항 진행 상황(surrenderProgress)은 같은 팀에게만 전송 — 상대 팀에 비노출
 * - 역할 전체 공개는 게임 종료(gameOver) 시에만
 */

import type { CharacterId, Faction, InvestigationResult } from '../characters/characterModel';
import type { RoomTimerSettings } from '../config/gameConfig';
import type { PlayerMode } from '../config/roster';

export const SOCKET_EVENTS = {
  /* ── 타이머 (서버 → 방 전체) ── */
  timerSync: 'timer:sync',
  timerClear: 'timer:clear',

  /* ── 방(로비) ── */
  /** C→S (ack): 방 생성 { name, settings? } → RoomStatePayload */
  roomCreate: 'room:create',
  /** C→S (ack): 코드로 입장 { code, name } → RoomStatePayload */
  roomJoin: 'room:join',
  /** C→S: 방 나가기 */
  roomLeave: 'room:leave',
  /** C→S (ack): 방장 설정 변경 (RoomSettingsPayload) */
  roomSettings: 'room:settings',
  /** C→S: 진영 선호 선택 { faction: Faction | null } — 배정 보장 아님 */
  roomFactionPreference: 'room:factionPreference',
  /** C→S (ack): 준비 토글 { ready: boolean } — 정원이 다 차고 전원 준비되면 자동 시작 */
  roomReady: 'room:ready',
  /** C→S (ack): 방장 게임 시작 */
  roomStart: 'room:start',
  /** S→방 전체: 로비 상태 동기화 */
  roomState: 'room:state',

  /* ── 게임 ── */
  /** S→개인: 본인 캐릭터 배정 (비공개) */
  gameRole: 'game:role',
  /** S→방 전체: 공개 게임 상태 (역할·밤 정보 없음) */
  gameState: 'game:state',
  /** C→S: 머신 액션 (ClientGameAction) — 서버가 발신자 권한 검증 후 머신에 주입 */
  gameAction: 'game:action',
  /** S→해태 본인: 투사 결과 */
  gameInvestigation: 'game:investigation',
  /** S→자청비 본인: 부활꽃 대상 후보 (그날 밤 악 진영 킬 사망자만) */
  gameFlowerOptions: 'game:flowerOptions',
  /** S→방 전체: 게임 종료 + 역할 전체 공개 */
  gameOver: 'game:over',

  /* ── 채팅 ── */
  /** C→S: { channel, text } — EVIL 채널은 악 진영 생존자만, 밤에만 */
  chatSend: 'chat:send',
  /** S→스코프별: ChatMessagePayload */
  chatMessage: 'chat:message',

  /* ── 투항 (6번 섹션 — 30초 팀 동의) ── */
  /** C→S: 투항 (최초 클릭 = 진행 시작, 이후 클릭 = 동의) */
  surrenderAgree: 'surrender:agree',
  /** S→같은 팀만: 진행 상황 (상대 팀 비노출) */
  surrenderProgress: 'surrender:progress',
} as const;

/* ── 타이머 ── */

/** timer:sync 페이로드 — 클라이언트는 endsAt과 serverNow의 차로 남은 시간을 계산해 표시 */
export interface TimerSyncPayload {
  /** 어떤 페이즈의 타이머인지 (상태 경로 기반 키, 예: "vote:2", "speech:1:p3") */
  phaseKey: string;
  durationSeconds: number;
  /** 서버 기준 만료 시각 (epoch ms) */
  endsAt: number;
  /** 페이로드 생성 시점의 서버 시각 (epoch ms) — 클라이언트 시계 보정용 */
  serverNow: number;
}

/* ── 방(로비) ── */

/** 방 설정 — 1번 섹션: 7인/9인 모드, 발언 80/120초, 토론 3/5분 (값은 ROOM_OPTIONS로 검증) */
export interface RoomSettingsPayload extends RoomTimerSettings {
  mode: PlayerMode;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  /** 계정 프로필 사진 URL (서버 상대 경로) — 없으면 기본 아바타 표시 */
  avatarUrl: string | null;
  /** 준비 완료 여부 — 정원이 다 차고 전원 true가 되면 자동으로 게임이 시작된다 */
  ready: boolean;
  // 진영 선호는 전략 정보라 로비에서도 서로 공개하지 않는다 — 본인 확인은 ack로
}

export interface RoomStatePayload {
  code: string;
  hostId: string;
  settings: RoomSettingsPayload;
  players: RoomPlayerInfo[];
  inGame: boolean;
}

/* ── 게임 ── */

/** 본인에게만 전송되는 배정 정보 */
export interface GameRolePayload {
  characterId: CharacterId;
  faction: Faction;
  seat: number;
}

export interface PublicPlayerState {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  /** 계정 프로필 사진 URL — 플레이어 목록·투표창·채팅 프로필에 사용, 없으면 기본 아바타 */
  avatarUrl: string | null;
}

/** 방 전체 공개 상태 — 캐릭터·진영·밤 행동·투표 내역은 포함하지 않는다 */
export interface PublicGameState {
  /** 상태 경로 (예: "day.vote", "night.goodSkills", "gameOver") */
  phase: string;
  day: number;
  players: PublicPlayerState[];
  advisorId: string | null;
  speechDirection: 'FORWARD' | 'REVERSE';
  /** 개인 발언 중인 플레이어 (없으면 null) */
  currentSpeakerId: string | null;
  /** 조언자 출마자 (선출 단계) */
  candidates: string[];
  /** 동표 재투표 후보 */
  tieCandidates: string[];
  /** 최후의 변론 대상 */
  executionTargetId: string | null;
  /** 사망 트리거 입력 대기 (유서/승계 — 대기 사실 자체는 공개 정보) */
  awaiting: { kind: 'GRUDGE' | 'SUCCESSION'; playerId: string } | null;
  winner: Faction | null;
}

/** 해태 본인에게만 전송 */
export interface InvestigationPayload {
  targetId: string;
  result: InvestigationResult;
}

/**
 * 자청비 본인에게만 전송 — 부활꽃 대상 후보 (5번 섹션: 그날 밤 악 진영 킬 사망자만,
 * 동반사망자·투표 처형자는 대상 아님). 빈 배열이면 부활 가능한 대상 없음(멸망꽃/패스만 가능).
 */
export interface FlowerOptionsPayload {
  revivableTargetIds: string[];
}

/** 게임 종료 시에만 역할 전체 공개 + 개인별 승패 귀속 */
export interface PlayerGameResult {
  playerId: string;
  characterId: CharacterId;
  faction: Faction;
  /** 종료 시점 생존 여부 */
  alive: boolean;
  /**
   * 승패 귀속 — 승리 진영 소속이면 승자.
   * 중립(바리공주·전향 까치선비)은 "생존 시 승리 팀에 합류":
   * 선 승리 시 생존 중립 합류는 requirements 8번에 확정,
   * ⚠️ 악 승리 시 중립 합류·사망 중립의 귀속은 문서 미확정 — 동일 규칙으로 가정
   */
  isWinner: boolean;
}

export interface GameOverPayload {
  winner: Faction;
  roles: PlayerGameResult[];
}

/* ── 채팅 ── */

export type ChatChannel = 'PUBLIC' | 'EVIL';

export interface ChatMessagePayload {
  channel: ChatChannel;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

/* ── 투항 ── */

export interface SurrenderProgressPayload {
  faction: Faction;
  /** 동의한 플레이어 id */
  agreed: string[];
  /** 동의가 필요한 생존자 전원 */
  required: string[];
  /** 30초 동의 마감 시각 (epoch ms) */
  endsAt: number;
  status: 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED';
}
