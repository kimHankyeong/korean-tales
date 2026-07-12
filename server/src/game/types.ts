/**
 * 게임 상태 머신 런타임 타입 — docs/requirements.md 4·5·7번 섹션 기반
 * 캐릭터/스킬 고정 정의는 @korean-tales/shared 참조.
 */

import type { CharacterId, DeathCause, Faction, InvestigationResult, SkillId } from '@korean-tales/shared';

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
  /** 일차 — 1부터 시작, 새벽(dawn)마다 +1 */
  day: number;

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
  /** 도깨비 장난 사용된 밤 — 새벽 킬 무효 */
  prankUsedTonight: boolean;
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

export type GameEvent =
  /** 서버 권위 타이머 만료 (타이머 시스템은 추후 연결 — 지금은 외부 이벤트로만 취급) */
  | { type: 'TIME_UP' }
  /** 개인 발언·토론·변론 조기 종료 (전원 skip 집계는 소켓 연동 시 서버가 판단해 1회 발행) */
  | { type: 'SKIP' }
  /* 첫날 아침 — 조언자 선출 */
  | { type: 'CANDIDACY_APPLY'; playerId: string }
  /* 투표 (선출/처형/재투표 공용) */
  | { type: 'VOTE'; voterId: string; targetId: string | 'ABSTAIN' }
  /* 조언자: 매 아침 발언 방향 결정 */
  | { type: 'ADVISOR_DIRECTION'; direction: 'FORWARD' | 'REVERSE' }
  /* 낮 시작 — 자청비 */
  | { type: 'FLOWER_REVIVE'; targetId: string }
  | { type: 'FLOWER_DOOM'; targetId: string }
  | { type: 'FLOWER_PASS' }
  /* 밤 — 선 진영 */
  | { type: 'HAETAE_INVESTIGATE'; targetId: string }
  | { type: 'DOKKAEBI_PRANK' }
  /* 밤 — 악 진영 */
  | { type: 'EVIL_KILL_VOTE'; voterId: string; targetId: string }
  | { type: 'JEOSEUNG_COMPANION'; targetId: string }
  | { type: 'GUMIHO_SEDUCE' }
  /* 사망 확정 트리거 응답 */
  | { type: 'GRUDGE_TARGET'; targetId: string }
  | { type: 'GRUDGE_FORGO' }
  | { type: 'ADVISOR_SUCCEED'; targetId: string }
  | { type: 'ADVISOR_DESTROY' };

export interface GameInput {
  players: GamePlayer[];
  /** 미지정 시 Math.random */
  rng?: () => number;
}
