/**
 * 캐릭터/스킬 데이터 모델 (타입 정의) — docs/requirements.md 3번 섹션 기반
 *
 * 이 파일은 타입만 정의한다. 9개 캐릭터 인스턴스 데이터는
 * `shared/src/config/characters.ts`, 모드별 로스터는 `shared/src/config/roster.ts` 참고.
 *
 * 조언자(방울)는 캐릭터가 아니라 첫날 아침에 선출되는 역할이므로
 * 여기 정의하지 않고 게임 상태 머신(7번 섹션)에서 다룬다.
 */

/* ── 진영 ──────────────────────────────────────────── */

export const FACTION_IDS = ['EVIL', 'GOOD', 'NEUTRAL'] as const;
export type Faction = (typeof FACTION_IDS)[number];

export interface FactionMeta {
  id: Faction;
  label: string;
  /** 지침 설명 모달에 표시할 승리 조건 (8번 섹션). day count와 무관하게 성립 */
  winCondition?: string;
}

/* ── 공통 열거형 ───────────────────────────────────── */

/** 사망 원인 — 부활 가능 판정, 동귀어진 봉인 판정 등의 공용 기준 */
export type DeathCause =
  | 'EVIL_NIGHT_KILL'  // 악 진영의 밤 킬
  | 'DAY_EXECUTION'    // 낮 투표 처형
  | 'DOOM_FLOWER'      // 자청비 멸망꽃
  | 'COMPANION_DEATH'  // 저승길 동무 동반 사망
  | 'TAKE_ALONG'       // 피 맺힌 유서(동귀어진) 동반 사망
  | 'FORFEIT';         // P버튼(즉시 사망) 처리

/** 사용 횟수 제한 — 무제한 / 1회 / 2회 */
export type SkillUses = 'UNLIMITED' | 1 | 2;

/** 사용 가능 시점 (패시브·자동 발동 스킬은 timing 없음) */
export type SkillTiming =
  | 'NIGHT'              // 밤 (저승사자·구미호·해태·도깨비)
  | 'MORNING'            // 아침 (자청비)
  | 'ON_DEATH_CONFIRMED'; // 자신의 사망 확정 시 (장화홍련)

/** 해태 '투사' 조사 시 표시값 */
export type InvestigationResult = 'EVIL' | 'NOT_EVIL';

/** 대상 지정 범위 */
export type TargetScope =
  | 'ALIVE'                      // 생존자 전원
  | 'ALIVE_OTHERS'               // 자신을 제외한 생존자
  | 'DIED_TONIGHT_BY_EVIL_KILL'; // 그날 밤 악 진영 킬로 사망한 사람만

export interface SkillTarget {
  count: number;
  scope: TargetScope;
}

/** FSM에서 스킬 처리를 분기할 때 쓰는 효과 태그 */
export type SkillEffectKind =
  | 'COMPANION_ON_DEATH'     // 저승길 동무: 본인 사망 시 지정자 동반 사망
  | 'INVESTIGATION_DISGUISE' // 재앙무죄: 투사에 NOT_EVIL로 표시 (패시브)
  | 'SKIP_NEXT_DAY_VOTE'     // 유혹: 다음날 낮 투표 스킵
  | 'REVIVE'                 // 부활꽃
  | 'EXECUTE_IMMEDIATELY'    // 멸망꽃
  | 'INVESTIGATE'            // 투사
  | 'BLOCK_EVIL_NIGHT_KILL'  // 도깨비 장난
  | 'TAKE_ALONG_ON_DEATH'    // 피 맺힌 유서(동귀어진)
  | 'AUTO_REVIVE'            // 연민: 까치선비 자동 부활
  | 'REVIVE_BENEFICIARY';    // 까치의 보은: 부활 대상 + 중립 전환

/* ── 스킬 ─────────────────────────────────────────── */

export type SkillId =
  | 'companion'       // 저승길 동무
  | 'innocence'       // 재앙무죄 (패시브)
  | 'seduce'          // 유혹
  | 'revival-flower'  // 부활꽃
  | 'doom-flower'     // 멸망꽃
  | 'judge'           // 투사
  | 'prank'           // 도깨비 장난
  | 'blood-grudge'    // 피 맺힌 유서
  | 'compassion'      // 연민
  | 'gratitude';      // 까치의 보은

export interface Skill {
  id: SkillId;
  /** 스킬명 (스킬북 UI 표기) */
  name: string;
  /** 사용 횟수 제한: 'UNLIMITED' | 1 | 2 */
  uses: SkillUses;
  /** 패시브(자동 발동 포함) 여부 — true면 별도 발동 절차 없음 */
  isPassive: boolean;
  /** 사용 가능 시점. 패시브·자동 발동 스킬은 생략 */
  timing?: SkillTiming;
  /** "스킬 포기" 버튼 노출 여부 (장화홍련 피 맺힌 유서) */
  canForgo: boolean;
  /** FSM 분기용 효과 태그 */
  effectKind: SkillEffectKind;
  /** 스킬북 UI에 표시할 설명 */
  description: string;
  /** 대상 지정이 없는 스킬(장난·유혹·패시브)은 생략 */
  target?: SkillTarget;
  /** 선택 제한시간(초). 초과 시 자동 포기 — 값은 TIMER_CONFIG에서 가져올 것 */
  decisionSeconds?: number;
  /** 같은 그룹의 스킬은 같은 페이즈(아침)에 동시 사용 불가 (자청비 두 꽃) */
  exclusiveGroup?: string;

  /* ── 특수 규칙 필드 ── */
  /** 부활 스킬 전용: 되살릴 수 있는 사망 원인. 'ANY'면 원인 불문 (연민) */
  revivableCauses?: readonly DeathCause[] | 'ANY';
  /** 사망 트리거 스킬 전용: 이 원인으로 사망하면 스킬 기회 자체가 봉인됨 (멸망꽃 → 동귀어진) */
  sealedByDeathCauses?: readonly DeathCause[];
  /** 부활 시 전환되는 진영 (까치의 보은 → NEUTRAL) */
  convertsToFactionOnRevive?: Faction;
  /** REVIVE_BENEFICIARY 전용: 부활을 수행해 주는 캐릭터 (까치의 보은 → 바리공주) */
  reviverCharacterId?: CharacterId;

  /** 예외 규칙·세부 판정 메모 */
  notes?: readonly string[];
}

/* ── 캐릭터 ───────────────────────────────────────── */

// id는 기존 프로토타입(frontreact)의 일러스트 에셋 키와 호환되도록 유지
export type CharacterId =
  | 'jeoseung'   // 저승사자
  | 'kkangcheol' // 깡철이
  | 'gumiho'     // 구미호
  | 'jacheongbi' // 자청비
  | 'haetae'     // 해태
  | 'dokkaebi'   // 도깨비
  | 'janghwa'    // 장화홍련
  | 'baridegi'   // 바리공주 (에셋 호환을 위해 id는 baridegi 유지)
  | 'kkachi';    // 까치선비 (선 진영 시작 → 부활 시 중립 전환)

export interface GameCharacter {
  id: CharacterId;
  name: string;
  faction: Faction;
  /** 배경설화 1~2줄 — 스킬북 UI에 스킬 설명과 함께 표시 */
  lore: string;
  /**
   * 해태 '투사' 조사 시 표시값.
   * 깡철이는 악 진영이지만 '재앙무죄' 패시브로 NOT_EVIL로 표시된다.
   */
  investigationResult: InvestigationResult;
  /** 자청비만 2개(부활꽃·멸망꽃), 나머지는 1개 이하 */
  skills: readonly Skill[];
}

/* ── 런타임 상태 (게임 진행 중 가변 데이터) ────────── */

/** 플레이어별 스킬 사용 상태. 부활해도 usedCount는 유지된다 (부활자 공통 규칙). */
export interface PlayerSkillState {
  skillId: SkillId;
  usedCount: number;
  /** 멸망꽃 사망으로 인한 동귀어진 봉인, 같은 아침 꽃 상호 배타 등 일시/영구 비활성 */
  disabled: boolean;
}

/** 저승길 동무 지정 상태 — 매 밤 재지정 시 갱신 */
export interface CompanionMark {
  ownerPlayerId: string;
  targetPlayerId: string;
  designatedOnNight: number;
}

/** 사망 기록 — 부활 가능 여부·사망 트리거 판정의 근거 */
export interface DeathRecord {
  playerId: string;
  cause: DeathCause;
  /** 사망이 발생한 일차와 페이즈 (부활 타이밍 판정용) */
  day: number;
  phase: 'NIGHT' | 'DAY';
}
