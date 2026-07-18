/**
 * 게임 상태 머신 런타임 타입 — docs/requirements.md 4·5·7번 섹션 기반
 * 캐릭터/스킬 고정 정의는 @korean-tales/shared 참조.
 */

import type {
  CharacterId,
  DeathCause,
  Faction,
  InvestigationResult,
  PlayerMode,
  RoomTimerSettings,
  SkillId,
} from '@korean-tales/shared';

/** 게임에 참여 중인 플레이어의 런타임 상태 */
export interface GamePlayer {
  id: string;
  /** 배정 번호 (발언 순서·표시용) */
  seat: number;
  characterId: CharacterId;
  /** 까치선비는 부활 시 NEUTRAL로 전환되므로 캐릭터 정의와 별도로 보관 */
  faction: Faction;
  alive: boolean;
  /** 스킬별 사용 횟수. 부활해도 초기화되지 않는다 (부활자 공통 규칙) */
  skillUses: Partial<Record<SkillId, number>>;
}

/** 사망 확정 트리거 종류 (requirements 5-6항) */
export type DeathTriggerKind =
  | 'COMPANION'       // 저승사자: 길동무 동반 사망 (자동)
  | 'GRUDGE'          // 장화홍련: 피 맺힌 유서 대상 선택 (입력 대기)
  | 'SUCCESSION'      // 조언자: 방울 승계/파기 선택 (입력 대기)
  | 'KKACHI_REVIVAL'; // 까치선비: 연민 자동 부활 예약 (자동)

/** 처리 대기 중인 사망 건 */
export interface PendingDeath {
  playerId: string;
  cause: DeathCause;
  /** alive=false 반영 여부 — 밤 킬은 새벽에 즉시 반영하되 트리거는 꽃 단계 후 처리 */
  applied: boolean;
  /** 남은 사망 확정 트리거 (최초 처리 시 계산되어 순차 소진) */
  triggers?: DeathTriggerKind[];
}

/** 입력 대기 중인 사망 트리거 */
export interface AwaitingTrigger {
  kind: 'GRUDGE' | 'SUCCESSION';
  playerId: string;
}

/** 사망 처리 완료 후 복귀 지점 */
export type ResumePoint = 'DAY_DISCUSSION' | 'NIGHT';

/** 해태 투사 결과 기록 (서버가 해태에게만 전달할 데이터) */
export interface InvestigationRecord {
  targetId: string;
  result: InvestigationResult;
}

export interface GameContext {
  players: GamePlayer[];
  /** 일차 — 밤 0(게임 시작 직후 첫 밤) 종료 시 1이 되고, 이후 새벽(dawn)마다 +1 */
  day: number;
  /** 인원수 모드 — 7인 모드는 조언자 선출 없음 (1번 섹션) */
  mode: PlayerMode;
  /** 방장이 선택한 개인 발언·전체 토론 시간 (1번 섹션 옵션) */
  roomSettings: RoomTimerSettings;
  /** 낮 개인 발언 남은 순서 (head = 현재 발언자). 매 아침 조언자 규칙으로 재계산 */
  speechQueue: string[];
  /** 전체 토론 skip 집계 — 생존자 전원 skip 시 조기 종료 (1번 섹션) */
  skipVotes: string[];
  /** 9인 모드에서 밤 0 종료 후 조언자 선출로 진입해야 하는지 — 1회 소모되면 false로 고정 */
  firstMorningPending: boolean;

  /* 조언자 (requirements 7번) */
  advisorId: string | null;
  /** 방울 파기됨 — 이후 발언 순서는 앞번호부터 정순 고정 */
  advisorBroken: boolean;
  /** 매 아침 조언자가 결정하는 발언 방향 */
  speechDirection: 'FORWARD' | 'REVERSE';
  /** 조언자 출마자 */
  candidates: string[];
  /** 어필 발언 남은 순서 (head = 현재 발언자) */
  appealQueue: string[];

  /* 투표 (선출·처형 공용) */
  votes: Record<string, string | 'ABSTAIN'>;
  /** 동표 시 재투표 후보 제한 */
  tieCandidates: string[];
  /** 최후의 변론 대상 (처형 확정자) */
  executionTargetId: string | null;

  /* 밤 */
  evilVotes: Record<string, string>;
  nightKillTargetId: string | null;
  /** 도깨비가 그날 밤 지정한 보호 대상 — 밤마다 재지정, 새벽 처리 후 초기화 */
  dokkaebiProtectTargetId: string | null;
  /**
   * 그날 밤 도깨비 장난으로 살아남은 대상 — 그 아침 자청비가 이 대상에게 부활꽃을
   * 사용해도(실제로는 되살릴 필요가 없지만) 유효한 사용으로 인정해 소모 처리한다.
   * 매 새벽 새로 계산되어 덮어써진다.
   */
  dokkaebiSavedTargetId: string | null;
  /** 구미호 유혹 — 다음날 낮 투표 스킵 */
  seduceNextDay: boolean;
  /** 저승사자가 지정해 둔 길동무 (재지정 시 갱신, 사망 시 소모) */
  companionTargetId: string | null;
  lastInvestigation: InvestigationRecord | null;

  /* 사망 처리 */
  pendingDeaths: PendingDeath[];
  awaiting: AwaitingTrigger | null;
  resumeAfterDeaths: ResumePoint;
  /** 다음 새벽에 부활할 플레이어 (연민 예약) */
  scheduledRevivals: string[];

  winner: Faction | null;
  /** 무작위 판정용 난수원 — 테스트에서 결정적 함수 주입 */
  rng: () => number;
}

// 머신 이벤트는 client/server 공용 계약 — shared에 단일 원본이 있다
export type { ClientGameAction, GameEvent } from '@korean-tales/shared';

export interface GameInput {
  players: GamePlayer[];
  /** 미지정 시 Math.random */
  rng?: () => number;
  /** 인원수 모드 — 미지정 시 players 수로 추정 (7명이면 7인 모드) */
  mode?: PlayerMode;
  /** 방장이 선택한 타이머 옵션 — 미지정 시 DEFAULT_ROOM_TIMER_SETTINGS */
  settings?: RoomTimerSettings;
}
