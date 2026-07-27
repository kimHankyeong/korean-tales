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
  /**
   * 가장 최근에 종료된 낮 처형 투표(또는 재투표)의 voterId→targetId 스냅샷 — 3초간 화살표로
   * 공개하는 데 쓴다(9번 피드백). room.ts가 참조 동일성으로 "새 결과인지" 판별하므로 매번
   * 새 객체로 대입한다. null이면 아직 종료된 투표가 없음
   */
  lastVoteResult: Record<string, string> | null;
  /**
   * 처형 투표(또는 재투표) 종료 후 voteReveal(투표 결과 공개) 상태를 거칠 때, 그 공개가
   * 끝나면 어디로 갈지 기억해두는 값 — voteReveal 자체는 목적지가 매번 다른 공용 상태라
   * XState 정적 target만으로는 표현할 수 없어 guard가 이 값을 읽고 분기한다
   */
  postVoteTarget: 'NIGHT' | 'FINAL_PLEA' | 'TIE_SPEECH' | null;

  /* 밤 */
  evilVotes: Record<string, string>;
  nightKillTargetId: string | null;
  /** 도깨비가 그날 밤 지정한 보호 대상 — 밤마다 재지정, 새벽 처리 후 초기화 */
  dokkaebiProtectTargetId: string | null;
  /**
   * 자청비가 goodSkills 시간에 지정한 부활꽃 대상(그날 밤 킬 대상만 후보) — 도깨비 보호 결과를
   * 아직 모르는 채로 선택한다. 실제 반영·스킬 소모는 새벽(processDawn)에서 일괄 처리, 새벽 처리 후 초기화
   */
  reviveTargetId: string | null;
  /** 자청비가 그날 밤 이미 멸망꽃을 사용했는지 — 같은 밤 부활꽃과 동시 사용 방지용 */
  doomUsedTonight: boolean;
  /**
   * 이번 밤이 시작될 때(night.entry)의 생존 여부 스냅샷 — 밤 킬/동반 사망 등으로 그날 밤
   * 확정된 사망은 아침(낮 시작)까지 공개 상태(PublicGameState.alive)에 노출되지 않도록
   * publicState.ts가 이 스냅샷으로 마스킹하는 데 쓰인다(4-c 피드백: 사망 조기 노출 방지)
   */
  nightStartAlive: Record<string, boolean>;
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
  /**
   * 방금 확정된 공개 발표 문구(길동무 동반 사망·유서 대상 지목·구미호 유혹으로 인한
   * 투표 스킵 등) — Room이 감지해 방 전체에 game:announcement로 중계한다. 표시 시간은
   * 문구마다 다를 수 있어(예: 유혹 안내는 3초, 나머지는 4초) durationMs로 함께 싣는다.
   * 객체 참조 동일성으로 "새 발표인지" 판별하므로, 값이 실제로 바뀔 때만 새 객체를 만든다.
   */
  deathAnnouncement: { text: string; durationMs: number } | null;

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
