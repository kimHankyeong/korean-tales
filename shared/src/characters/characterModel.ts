/**
 * 캐릭터/스킬 데이터 모델 — docs/requirements.md 3번 섹션 기반
 *
 * 이 파일은 캐릭터의 "고정 정의"(진영·배경 설화·스킬 스펙)만 담는다.
 * 게임 진행 중 변하는 값(사용 횟수, 길동무 지정 상태 등)은
 * 파일 하단의 런타임 상태 인터페이스를 사용한다.
 *
 * 조언자(방울)는 캐릭터가 아니라 첫날 아침에 선출되는 역할이므로
 * 여기 정의하지 않고 게임 상태 머신(7번 섹션)에서 다룬다.
 */

import { TIMER_CONFIG } from '../config/gameConfig';

/* ── 진영 ──────────────────────────────────────────── */

export type FactionId = 'evil' | 'good' | 'neutral';

export interface Faction {
  id: FactionId;
  label: string;
  /** 지침 설명 모달에 표시할 승리 조건 (8번 섹션). day count와 무관하게 성립 */
  winCondition?: string;
}

export const FACTIONS: Record<FactionId, Faction> = {
  evil: {
    id: 'evil',
    label: '악 진영',
    winCondition: '선 진영 전원 탈락, 또는 선 진영 전원이 항복(투항) 투표',
  },
  good: {
    id: 'good',
    label: '선 진영',
    winCondition: '악 진영 전원 탈락, 또는 악 진영 전원이 항복(투항) 투표',
  },
  neutral: {
    id: 'neutral',
    label: '중립',
    // 중립 진영 자체의 승리 조건은 문서에 미정 — 확정 시 추가
  },
};

/* ── 공통 열거형 ───────────────────────────────────── */

/** 사망 원인 — 부활꽃 대상 판정, 동귀어진 봉인 판정 등에 사용 */
export type DeathCause =
  | 'evilNightKill'   // 악 진영의 밤 킬
  | 'dayExecution'    // 낮 투표 처형
  | 'doomFlower'      // 자청비 멸망꽃
  | 'companionDeath'  // 저승길 동무 동반 사망
  | 'takeAlong'       // 장화홍련 동귀어진 동반 사망
  | 'forfeit';        // P버튼(즉시 사망) 처리

/** 스킬 발동 시점 */
export type SkillTiming =
  | 'night'            // 밤 페이즈에 사용 결정 (해태·도깨비·구미호·저승사자)
  | 'morning'          // 아침에 사용 (자청비)
  | 'onDeathConfirmed' // 자신의 사망 확정 시 트리거 (장화홍련)
  | 'auto'             // 조건 충족 시 자동 발동 (바리공주 연민, 까치선비)
  | 'passive';         // 상시 적용, 발동 절차 없음 (깡철이)

/** 게임당 사용 가능 횟수 */
export type SkillUses = number | 'unlimited';

/** 대상 지정 범위 */
export type TargetScope =
  | 'alive'                  // 생존자 전원
  | 'aliveOthers'            // 자신을 제외한 생존자
  | 'diedTonightByEvilKill'; // 그날 밤 악 진영 킬로 사망한 사람만

export interface SkillTarget {
  count: number;
  scope: TargetScope;
}

/* ── 스킬 효과 (discriminated union) ──────────────── */

export type SkillEffect =
  /** 저승길 동무: 전날 밤 길동무 1인 지정 → 자신이 사망하면 함께 사망. 매 밤 재지정 가능 */
  | { kind: 'companionOnDeath' }
  /** 재앙무죄(깡철이 패시브): 해태의 투사 결과가 항상 shownAs 문구로 표시됨 */
  | { kind: 'investigationDisguise'; shownAs: string }
  /** 유혹: 다음날 낮 투표 단계를 통째로 스킵 (토론 후 바로 밤 전환) */
  | { kind: 'skipNextDayVote' }
  /** 부활꽃: allowedCauses에 해당하는 사망자만 되살림 */
  | { kind: 'revive'; allowedCauses: DeathCause[] }
  /** 멸망꽃: 1인 즉시 처형 */
  | {
      kind: 'executeImmediately';
      /** 도깨비 장난으로 방어 불가 */
      blockableByPrank: false;
      /** 이 원인으로 죽으면 동귀어진류 사망 트리거 스킬 기회 자체가 주어지지 않음 */
      victimLosesDeathSkills: true;
    }
  /** 투사(해태): 1인 지목 → 악 진영 여부를 문구로 통보 */
  | { kind: 'investigate'; positiveText: string; negativeText: string }
  /** 도깨비 장난: 그날 밤 악 진영 킬 무효화 (대상 지정 없음) */
  | {
      kind: 'blockEvilNightKill';
      /** 멸망꽃 킬은 막지 못함 */
      blocksDoomFlower: false;
      /** 차단 사실을 악 진영에게 바로 알리지 않음 — 아침에 "사망자 없음"으로만 표시 */
      hiddenFromEvil: true;
    }
  /** 동귀어진(장화홍련): 사망 확정 시 1인 지목해 함께 데려감 */
  | { kind: 'takeAlongOnDeath'; disabledByCauses: DeathCause[] }
  /** 연민(바리공주): 지정 캐릭터 사망 시 자동 부활 예약 — 사망 원인 불문 */
  | {
      kind: 'autoRevive';
      fixedTargetCharacterId: CharacterId;
      allowedCauses: 'any';
      /** 낮 사망이면 당일 아침, 그 외에는 다음날 아침 부활 (문서 3번 섹션) */
      resolveTiming: 'nextMorning';
    }
  /** 까치의 보은(까치선비): 스킬·투표로 사망하면 다음날 아침 부활하고 진영이 중립으로 전환 */
  | {
      kind: 'reviveBeneficiary';
      /** 부활은 이 캐릭터(바리공주)의 연민 자동 발동으로 이루어진다 */
      reviverCharacterId: CharacterId;
      /** 부활 시 전환되는 진영 */
      convertsToFactionOnRevive: FactionId;
      resolveTiming: 'nextMorning';
    };

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
  name: string;
  timing: SkillTiming;
  uses: SkillUses;
  /** 스킬북 UI에 표시할 설명 */
  description: string;
  /** 대상 지정이 없는 스킬(장난·유혹 등)은 생략 */
  target?: SkillTarget;
  /** 선택 제한시간(초). 초과 시 자동 포기 — 값은 TIMER_CONFIG 참조 */
  decisionSeconds?: number;
  /** "스킬 포기" 버튼 노출 여부 (장화홍련) */
  canForgo?: boolean;
  /** 같은 그룹의 스킬은 같은 페이즈(아침)에 동시 사용 불가 (자청비 두 꽃) */
  exclusiveGroup?: string;
  effect: SkillEffect;
  /** 예외 규칙·세부 판정 메모 */
  notes?: string[];
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
  faction: FactionId;
  /** 배경 설화 1~2줄 — 스킬북 UI에 스킬 설명과 함께 표시 (문안은 초안) */
  lore: string;
  /** 자청비만 2개(부활꽃·멸망꽃), 나머지는 1개 이하 */
  skills: Skill[];
}

export const CHARACTERS: readonly GameCharacter[] = [
  /* ── 악 진영 ── */
  {
    id: 'jeoseung',
    name: '저승사자',
    faction: 'evil',
    lore: '죽은 자를 저승으로 인도하는 명부의 사자.',
    skills: [
      {
        id: 'companion',
        name: '저승길 동무',
        timing: 'night',
        uses: 2,
        decisionSeconds: TIMER_CONFIG.nightEvilIndividualSkill,
        target: { count: 1, scope: 'aliveOthers' },
        effect: { kind: 'companionOnDeath' },
        description:
          '전날 밤 미리 길동무 1인을 지정한다. 투표·처형 등으로 자신이 사망하면 지정한 사람이 함께 죽는다.',
        notes: ['2회 지정 후에도 사망하지 않았다면 스킬 종료.'],
      },
    ],
  },
  {
    id: 'kkangcheol',
    name: '깡철이',
    faction: 'evil',
    lore: '용이 되지 못하고 추락한 이무기. 그가 지나는 하늘 아래는 비가 마른다.',
    skills: [
      {
        id: 'innocence',
        name: '재앙무죄',
        timing: 'passive',
        uses: 'unlimited',
        effect: { kind: 'investigationDisguise', shownAs: '악 진영이 아닙니다' },
        description:
          '재앙에는 죄를 물을 수 없기에 해태의 심판이 닿지 않는다. 해태의 투사에 "악 진영이 아닙니다"로 표시된다.',
        notes: ['별도 발동 절차 없음 (패시브).'],
      },
    ],
  },
  {
    id: 'gumiho',
    name: '구미호',
    faction: 'evil',
    lore: '천 년을 묵어 사람의 마음을 홀리는 아홉 꼬리 여우.',
    skills: [
      {
        id: 'seduce',
        name: '유혹',
        timing: 'night',
        uses: 1,
        decisionSeconds: TIMER_CONFIG.nightEvilIndividualSkill,
        effect: { kind: 'skipNextDayVote' },
        description: '전날 밤 사용을 결정하면 다음날 낮 투표를 통째로 스킵한다.',
        notes: ['조사 회피 능력은 깡철이로 이전되어, 투표 스킵만 보유.'],
      },
    ],
  },

  /* ── 선 진영 ── */
  {
    id: 'jacheongbi',
    name: '자청비',
    faction: 'good',
    lore: '서천꽃밭의 꽃으로 생사를 다루는 농경의 여신.',
    skills: [
      {
        id: 'revival-flower',
        name: '부활꽃',
        timing: 'morning',
        uses: 1,
        decisionSeconds: TIMER_CONFIG.morningFlowerDecision,
        exclusiveGroup: 'seocheon-flower',
        target: { count: 1, scope: 'diedTonightByEvilKill' },
        effect: { kind: 'revive', allowedCauses: ['evilNightKill'] },
        description: '그날 밤 악 진영의 킬로 사망한 사람만 되살릴 수 있다(치유).',
        notes: [
          '제외 대상: 저승길 동무·피 맺힌 유서로 동반 사망한 사람, 낮 투표 처형자.',
          '그날 밤 악 진영 킬 사망자가 있을 때만 활성화.',
          '되살아난 사람이 이미 사용한 1회성 스킬은 소모된 상태로 유지된다 (복구 없음).',
        ],
      },
      {
        id: 'doom-flower',
        name: '멸망꽃',
        timing: 'morning',
        uses: 1,
        decisionSeconds: TIMER_CONFIG.morningFlowerDecision,
        exclusiveGroup: 'seocheon-flower',
        target: { count: 1, scope: 'alive' },
        effect: {
          kind: 'executeImmediately',
          blockableByPrank: false,
          victimLosesDeathSkills: true,
        },
        description: '생존자 1인을 지정해 즉시 처형한다.',
        notes: [
          '도깨비 장난으로 막을 수 없다.',
          '멸망꽃으로 사망하면 동귀어진 등 사망 트리거 스킬 기회가 주어지지 않는다.',
          '같은 아침에 부활꽃과 동시 사용 불가 (하나 선택 시 다른 쪽 비활성화).',
        ],
      },
    ],
  },
  {
    id: 'haetae',
    name: '해태',
    faction: 'good',
    lore: '옳고 그름을 가려내는 영수. 죄지은 자를 뿔로 받아낸다.',
    skills: [
      {
        id: 'judge',
        name: '투사',
        timing: 'night',
        uses: 'unlimited',
        decisionSeconds: TIMER_CONFIG.nightGoodSkillDecision,
        target: { count: 1, scope: 'aliveOthers' },
        effect: {
          kind: 'investigate',
          positiveText: 'n번은 악 진영입니다',
          negativeText: 'n번은 악 진영이 아닙니다',
        },
        description: '밤에 1인을 지목해 악 진영 여부를 확인한다.',
        notes: ['깡철이는 "악 진영이 아닙니다"로 표시된다.', '역할 확정(고정) — 변경하지 않음.'],
      },
    ],
  },
  {
    id: 'dokkaebi',
    name: '도깨비',
    faction: 'good',
    lore: '장난을 좋아하는 밤의 요괴. 심술 한 번에 사람 일이 뒤집힌다.',
    skills: [
      {
        id: 'prank',
        name: '도깨비 장난',
        timing: 'night',
        uses: 1,
        decisionSeconds: TIMER_CONFIG.nightDokkaebiDecision,
        effect: { kind: 'blockEvilNightKill', blocksDoomFlower: false, hiddenFromEvil: true },
        description: '그날 밤 악 진영의 킬을 무산시킨다.',
        notes: [
          '아침의 자청비 멸망꽃 킬은 막지 못한다.',
          '차단 사실은 악 진영에게 바로 알리지 않고, 다음날 아침 전체에게 "사망자 없음"으로만 표시.',
        ],
      },
    ],
  },
  {
    id: 'janghwa',
    name: '장화홍련',
    faction: 'good',
    lore: '억울하게 죽어 한을 품은 자매의 원혼.',
    skills: [
      {
        id: 'blood-grudge',
        name: '피 맺힌 유서',
        timing: 'onDeathConfirmed',
        uses: 1,
        decisionSeconds: TIMER_CONFIG.deathJanghwaDecision,
        canForgo: true,
        target: { count: 1, scope: 'aliveOthers' },
        effect: { kind: 'takeAlongOnDeath', disabledByCauses: ['doomFlower'] },
        description: '자신의 사망이 확정된 시점에 1인을 지목해 함께 데려간다(동귀어진).',
        notes: [
          '10초 내 미선택 시 자동 포기, "스킬 포기" 버튼 제공.',
          '멸망꽃으로 사망한 경우 스킬 기회 자체가 주어지지 않는다.',
        ],
      },
    ],
  },
  {
    id: 'kkachi',
    name: '까치선비',
    // 선 진영 소속으로 시작 — '까치의 보은' 발동(부활) 시 중립으로 전환
    faction: 'good',
    lore: '은혜를 갚기 위해 몸을 던진 까치의 화신.',
    skills: [
      {
        id: 'gratitude',
        name: '까치의 보은',
        timing: 'auto',
        uses: 1,
        effect: {
          kind: 'reviveBeneficiary',
          reviverCharacterId: 'baridegi',
          convertsToFactionOnRevive: 'neutral',
          resolveTiming: 'nextMorning',
        },
        description:
          '어떤 스킬의 영향이나 투표로 죽음을 맞이하면 다음날 아침 부활하며, 진영이 중립으로 전환된다.',
        notes: [
          '부활은 바리공주 생존 시 연민의 자동 발동으로 이루어진다 (사망 원인 불문).',
          '바리공주가 죽더라도 이미 중립이 된 까치선비가 생존해 있다면 게임은 계속된다.',
          '요구사항 문서상 능력 없는 캐릭터로, 위 특성은 스킬이 아닌 고유 특성이다.',
        ],
      },
    ],
  },

  /* ── 중립 ── */
  {
    id: 'baridegi',
    name: '바리공주',
    faction: 'neutral',
    lore: '버려졌으나 부모를 살리러 저승까지 다녀온 무조신.',
    skills: [
      {
        id: 'compassion',
        name: '연민',
        timing: 'auto',
        uses: 1,
        effect: {
          kind: 'autoRevive',
          fixedTargetCharacterId: 'kkachi',
          allowedCauses: 'any',
          resolveTiming: 'nextMorning',
        },
        description: '까치선비가 어떤 방식으로 사망하든 되살릴 수 있다 (자동 발동).',
        notes: [
          '저승길 동무·피 맺힌 유서 동반 사망 등 부활꽃이 닿지 않는 죽음에도 예외적으로 적용.',
          '낮 사망이면 당일 아침, 그 외에는 다음날 아침 자동 부활. 부활한 까치선비는 중립으로 전환.',
        ],
      },
    ],
  },
];

export const CHARACTER_BY_ID: Record<CharacterId, GameCharacter> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
) as Record<CharacterId, GameCharacter>;

/* ── 공통 규칙 (3번 섹션 체크박스 등) ──────────────── */

export const SKILL_COMMON_RULES: readonly string[] = [
  '부활꽃·연민으로 되살아난 사람이 이미 사용한 1회성 스킬은 소모된 상태로 유지된다 (복구되지 않음).',
  '악 진영의 밤 킬은 개인 스킬이 아닌 진영 공동 행동으로, 밤 페이즈 로직(FSM)에서 처리한다.',
  '바리공주가 사망해도 중립으로 전환된 까치선비가 생존해 있다면 게임은 계속 진행된다.',
];

/* ── 런타임 상태 (게임 진행 중 가변 데이터) ────────── */

/** 플레이어별 스킬 사용 상태. 부활해도 usedCount는 유지된다. */
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
  phase: 'night' | 'day';
}
