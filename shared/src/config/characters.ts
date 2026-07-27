/**
 * 캐릭터 인스턴스 데이터 — docs/requirements.md 3번 섹션의 표를 그대로 옮긴 config.
 * 타입 정의는 shared/src/characters/characterModel.ts 참고.
 * 규칙이 문서와 어긋나면 문서가 우선이다.
 */

import type {
  CharacterId,
  Faction,
  FactionMeta,
  GameCharacter,
  InvestigationResult,
} from '../characters/characterModel';
import { TIMER_CONFIG } from './gameConfig';

/* ── 진영 메타 (8번 섹션 승리 조건 포함) ───────────── */

export const FACTION_META: Record<Faction, FactionMeta> = {
  EVIL: {
    id: 'EVIL',
    label: '악 진영',
    winCondition: '선 진영 전원 탈락 혹은 항복(투항), 또는 중립 진영 전원 탈락',
  },
  GOOD: {
    id: 'GOOD',
    label: '선 진영',
    winCondition: '악 진영 전원 탈락, 또는 악 진영 전원이 항복(투항) 투표',
  },
  NEUTRAL: {
    id: 'NEUTRAL',
    label: '중립',
    // 선 진영 승리 조건과 동일 — 승패 전이에는 영향 없고 결과 표시에서 함께 승리 처리
    winCondition: '악 진영 전원 탈락 시점에 중립 진영 1명 이상 생존 시 선 진영과 함께 승리',
  },
};

/** 해태 '투사' 결과를 채팅에 표시할 때의 문구 템플릿 ({n} = 대상 번호) */
export const INVESTIGATION_RESULT_TEXT: Record<InvestigationResult, string> = {
  EVIL: '{n}번은 악 진영입니다',
  NOT_EVIL: '{n}번은 악 진영이 아닙니다',
};

/* ── 9개 캐릭터 인스턴스 ───────────────────────────── */

export const CHARACTERS: readonly GameCharacter[] = [
  /* ── 악 진영 ── */
  {
    id: 'jeoseung',
    name: '저승사자',
    faction: 'EVIL',
    lore: '죽은 자를 저승으로 인도하는 명부의 사자. 함께 걷는 저승길은 혼자 끝나지 않는다.',
    investigationResult: 'EVIL',
    skills: [
      {
        id: 'companion',
        name: '저승길 동무',
        uses: 2,
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'COMPANION_ON_DEATH',
        decisionSeconds: TIMER_CONFIG.nightEvilIndividualSkill,
        target: { count: 1, scope: 'ALIVE_OTHERS' },
        sealedByDeathCauses: ['DOOM_FLOWER', 'TAKE_ALONG'],
        description:
          '전날 밤 미리 길동무 1인을 지정한다. 투표·처형 등으로 자신이 사망하면 지정한 사람이 함께 죽는다.',
        notes: [
          '2회 지정 후에도 사망하지 않았다면 스킬 종료.',
          '자청비의 멸망꽃으로 사망한 경우 길동무 동반 사망이 발동하지 않는다.',
          '장화홍련의 피 맺힌 유서에 지목되어 사망한 경우에도 길동무 동반 사망이 발동하지 않는다.',
        ],
      },
    ],
  },
  {
    id: 'kkangcheol',
    name: '깡철이',
    faction: 'EVIL',
    lore: '용이 되지 못하고 추락한 이무기. 그가 지나는 하늘 아래는 비가 마른다.',
    // 재앙무죄 패시브: 악 진영이지만 투사에 "악 진영이 아닙니다"로 표시
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'innocence',
        name: '재앙무죄',
        uses: 'UNLIMITED',
        isPassive: true,
        canForgo: false,
        effectKind: 'INVESTIGATION_DISGUISE',
        description:
          '재앙에는 죄를 물을 수 없기에 해태의 심판이 닿지 않는다. 해태의 투사에 "악 진영이 아닙니다"로 표시된다.',
        notes: ['별도 발동 절차 없음 (패시브).'],
      },
    ],
  },
  {
    id: 'gumiho',
    name: '구미호',
    faction: 'EVIL',
    lore: '천 년을 묵어 사람의 마음을 홀리는 아홉 꼬리 여우.',
    investigationResult: 'EVIL',
    skills: [
      {
        id: 'seduce',
        name: '유혹',
        uses: 1,
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'SKIP_NEXT_DAY_VOTE',
        decisionSeconds: TIMER_CONFIG.nightEvilIndividualSkill,
        description: '전날 밤 사용을 결정하면 다음날 낮 투표를 통째로 스킵한다.',
        notes: ['조사 회피 능력은 깡철이로 이전되어, 투표 스킵만 보유.'],
      },
    ],
  },

  /* ── 선 진영 ── */
  {
    id: 'jacheongbi',
    name: '자청비',
    faction: 'GOOD',
    lore: '서천꽃밭의 꽃으로 생사를 다루는 농경의 여신.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'revival-flower',
        name: '부활꽃',
        uses: 1,
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'REVIVE',
        decisionSeconds: TIMER_CONFIG.nightGoodSkillDecision,
        exclusiveGroup: 'seocheon-flower',
        target: { count: 1, scope: 'DIED_TONIGHT_BY_EVIL_KILL' },
        revivableCauses: ['EVIL_NIGHT_KILL'],
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
        uses: 1,
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'EXECUTE_IMMEDIATELY',
        decisionSeconds: TIMER_CONFIG.nightGoodSkillDecision,
        exclusiveGroup: 'seocheon-flower',
        target: { count: 1, scope: 'ALIVE' },
        description: '생존자 1인을 지정해 즉시 처형한다.',
        notes: [
          '도깨비 장난으로 막을 수 없다.',
          '멸망꽃으로 사망하면 동귀어진 등 사망 트리거 스킬 기회가 주어지지 않는다.',
          '같은 밤에 부활꽃과 동시 사용 불가 (하나 선택 시 다른 쪽 비활성화).',
        ],
      },
    ],
  },
  {
    id: 'haetae',
    name: '해태',
    faction: 'GOOD',
    lore: '옳고 그름을 가려내는 영수. 죄지은 자를 뿔로 받아낸다.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'judge',
        name: '투사',
        uses: 'UNLIMITED',
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'INVESTIGATE',
        decisionSeconds: TIMER_CONFIG.nightGoodSkillDecision,
        target: { count: 1, scope: 'ALIVE_OTHERS' },
        description:
          '밤에 1인을 지목해 악 진영 여부를 확인한다. 결과는 "n번은 악 진영입니다 / 악 진영이 아닙니다"로 표시.',
        notes: [
          '결과는 대상 캐릭터의 investigationResult 값을 따른다 — 깡철이는 "악 진영이 아닙니다".',
          '역할 확정(고정) — 변경하지 않음.',
        ],
      },
    ],
  },
  {
    id: 'dokkaebi',
    name: '도깨비',
    faction: 'GOOD',
    lore: '장난을 좋아하는 밤의 요괴. 심술 한 번에 사람 일이 뒤집힌다.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'prank',
        name: '도깨비 장난',
        // 보호 성공 전까지 매일 밤 재사용 가능 — 실제 영구 소모 판정은 서버가 "보호 성공" 시점에만 처리
        uses: 1,
        isPassive: false,
        timing: 'NIGHT',
        canForgo: false,
        effectKind: 'PROTECT_FROM_NIGHT_KILL',
        target: { count: 1, scope: 'ALIVE' },
        decisionSeconds: TIMER_CONFIG.nightDokkaebiDecision,
        description: '매일 밤 보호할 생존자 1인을 지정한다. 그날 밤 악 진영의 킬 대상이 보호 대상과 같으면 그 사람은 죽지 않는다.',
        notes: [
          '보호에 한 번이라도 성공하면 이후 다시 사용할 수 없다. 성공한 적 없다면 매일 밤 대상을 다시 지정해 재사용할 수 있다.',
          '아침의 자청비 멸망꽃 킬은 막지 못한다.',
          '보호 성공 여부와 무관하게 차단 사실은 악 진영에게 바로 알리지 않고, 다음날 아침 전체에게 "사망자 없음"으로만 표시.',
        ],
      },
    ],
  },
  {
    id: 'janghwa',
    name: '장화홍련',
    faction: 'GOOD',
    lore: '억울하게 죽어 한을 품은 자매의 원혼.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'blood-grudge',
        name: '피 맺힌 유서',
        uses: 1,
        isPassive: false,
        timing: 'ON_DEATH_CONFIRMED',
        canForgo: true,
        effectKind: 'TAKE_ALONG_ON_DEATH',
        decisionSeconds: TIMER_CONFIG.deathJanghwaDecision,
        target: { count: 1, scope: 'ALIVE_OTHERS' },
        sealedByDeathCauses: ['DOOM_FLOWER', 'COMPANION_DEATH'],
        description: '자신의 사망이 확정된 시점에 1인을 지목해 함께 데려간다(동귀어진).',
        notes: [
          '10초 내 미선택 시 자동 포기, "스킬 포기" 버튼 제공.',
          '멸망꽃으로 사망한 경우 스킬 기회 자체가 주어지지 않는다.',
          '저승사자의 길동무로 지목되어 동반 사망한 경우에도 스킬 기회가 주어지지 않는다.',
        ],
      },
    ],
  },
  {
    id: 'kkachi',
    name: '까치선비',
    // 선 진영 소속으로 시작 — '까치의 보은' 발동(부활) 시 중립으로 전환
    faction: 'GOOD',
    lore: '은혜를 갚기 위해 몸을 던진 까치의 화신.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'gratitude',
        name: '까치의 보은',
        uses: 1,
        isPassive: true, // 자동 발동 — 플레이어의 선택 절차 없음
        canForgo: false,
        effectKind: 'REVIVE_BENEFICIARY',
        convertsToFactionOnRevive: 'NEUTRAL',
        reviverCharacterId: 'baridegi',
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
    faction: 'NEUTRAL',
    lore: '버려졌으나 부모를 살리러 저승까지 다녀온 무조신.',
    investigationResult: 'NOT_EVIL',
    skills: [
      {
        id: 'compassion',
        name: '연민',
        uses: 1,
        isPassive: true, // 자동 발동
        canForgo: false,
        effectKind: 'AUTO_REVIVE',
        revivableCauses: 'ANY',
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
