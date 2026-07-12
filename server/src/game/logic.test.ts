import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@korean-tales/shared';
import {
  canUseSkill,
  checkWin,
  computeDeathTriggers,
  computeSpeechOrder,
  investigate,
  processDeathQueue,
  resolveNightKillTarget,
  resolveVoteOutcome,
  type DeathProcessState,
} from './logic';
import type { GamePlayer, PendingDeath } from './types';

/** 9인 전원 배치 — p1~p9, 캐릭터 정의 순서(악3·선5·중립1) */
function makePlayers(): GamePlayer[] {
  return CHARACTERS.map((c, i) => ({
    id: `p${i + 1}`,
    seat: i + 1,
    characterId: c.id,
    faction: c.faction,
    alive: true,
    skillUses: {},
  }));
}

const byChar = (players: GamePlayer[], characterId: string) =>
  players.find((p) => p.characterId === characterId)!;

function makeDeathState(players: GamePlayer[], overrides?: Partial<DeathProcessState>): DeathProcessState {
  return {
    players,
    pendingDeaths: [],
    scheduledRevivals: [],
    advisorId: null,
    advisorBroken: false,
    companionTargetId: null,
    awaiting: null,
    ...overrides,
  };
}

describe('투표 판정 (requirements 5-4항)', () => {
  it('전원 기권이면 득표자 없음 → 처형 없음', () => {
    expect(resolveVoteOutcome({ a: 'ABSTAIN', b: 'ABSTAIN' })).toEqual({ kind: 'NO_TARGET' });
  });

  it('기권표가 다수여도 단 한 표라도 있으면 최다 득표자 확정', () => {
    expect(
      resolveVoteOutcome({ a: 'ABSTAIN', b: 'ABSTAIN', c: 'ABSTAIN', d: 'x' }),
    ).toEqual({ kind: 'DECIDED', targetId: 'x' });
  });

  it('최다 득표 동률이면 TIE와 후보 목록 반환', () => {
    const outcome = resolveVoteOutcome({ a: 'x', b: 'y', c: 'x', d: 'y' });
    expect(outcome.kind).toBe('TIE');
    if (outcome.kind === 'TIE') expect(outcome.candidates.sort()).toEqual(['x', 'y']);
  });
});

describe('낮 개인 발언 순서 (requirements 7번 조언자 규칙)', () => {
  it('조언자가 없으면 앞번호부터 정순 고정', () => {
    expect(computeSpeechOrder(makePlayers(), null, 'FORWARD')).toEqual([
      'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
    ]);
  });

  it('정순: 조언자 다음 번호부터 순환하고 조언자는 마지막', () => {
    expect(computeSpeechOrder(makePlayers(), 'p3', 'FORWARD')).toEqual([
      'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p1', 'p2', 'p3',
    ]);
  });

  it('역순: 조언자 이전 번호부터 감소 방향으로 순환하고 조언자는 마지막', () => {
    expect(computeSpeechOrder(makePlayers(), 'p3', 'REVERSE')).toEqual([
      'p2', 'p1', 'p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3',
    ]);
  });

  it('사망자는 발언 순서에서 제외된다', () => {
    const players = makePlayers().map((p) => (p.id === 'p5' ? { ...p, alive: false } : p));
    expect(computeSpeechOrder(players, null, 'FORWARD')).not.toContain('p5');
  });
});

describe('밤 킬 대상 판정 (requirements 4-3항)', () => {
  it('무투표면 킬 없음', () => {
    expect(resolveNightKillTarget({}, () => 0)).toBeNull();
  });

  it('동률이면 rng로 무작위 선택', () => {
    const target = resolveNightKillTarget({ a: 'x', b: 'y' }, () => 0);
    expect(['x', 'y']).toContain(target);
  });
});

describe('승리 판정 (requirements 8번)', () => {
  it('악 진영 전원 탈락 → 선 승리 (일차 무관)', () => {
    const players = makePlayers().map((p) => (p.faction === 'EVIL' ? { ...p, alive: false } : p));
    expect(checkWin(players)).toBe('GOOD');
  });

  it('선 진영 전원 탈락 → 악 승리', () => {
    const players = makePlayers().map((p) => (p.faction === 'GOOD' ? { ...p, alive: false } : p));
    expect(checkWin(players)).toBe('EVIL');
  });

  it('중립(바리공주·전향 까치선비)은 판정에 영향 없음 — 양 진영 생존 시 게임 계속', () => {
    const players = makePlayers().map((p) =>
      p.faction === 'NEUTRAL' ? { ...p, alive: false } : p,
    );
    expect(checkWin(players)).toBeNull();
  });
});

describe('해태 투사 (requirements 3번)', () => {
  it('깡철이는 악 진영이지만 "악 진영이 아닙니다"로 표시된다', () => {
    const players = makePlayers();
    expect(investigate(byChar(players, 'kkangcheol'))).toBe('NOT_EVIL');
    expect(investigate(byChar(players, 'gumiho'))).toBe('EVIL');
  });
});

describe('스킬 사용 횟수 (shared 정의 기반)', () => {
  it('저승길 동무는 2회까지 지정 가능', () => {
    const jeoseung = makePlayers()[0]!;
    expect(canUseSkill(jeoseung, 'companion')).toBe(true);
    expect(canUseSkill({ ...jeoseung, skillUses: { companion: 2 } }, 'companion')).toBe(false);
  });

  it('투사는 무제한', () => {
    const players = makePlayers();
    const haetae = byChar(players, 'haetae');
    expect(canUseSkill({ ...haetae, skillUses: { judge: 99 } }, 'judge')).toBe(true);
  });
});

describe('사망 확정 트리거 (requirements 5-6항)', () => {
  it('저승사자 사망 시 지정한 길동무가 동반 사망한다 (연쇄 처리)', () => {
    const players = makePlayers();
    const jeoseung = byChar(players, 'jeoseung');
    const haetae = byChar(players, 'haetae');
    const result = processDeathQueue(
      makeDeathState(players, {
        companionTargetId: haetae.id,
        pendingDeaths: [{ playerId: jeoseung.id, cause: 'DAY_EXECUTION', applied: false }],
      }),
    );
    expect(result.players.find((p) => p.id === jeoseung.id)?.alive).toBe(false);
    expect(result.players.find((p) => p.id === haetae.id)?.alive).toBe(false);
    expect(result.companionTargetId).toBeNull(); // 지정 소모
  });

  it('장화홍련 일반 사망 → 피 맺힌 유서 입력 대기(GRUDGE)', () => {
    const players = makePlayers();
    const janghwa = byChar(players, 'janghwa');
    const result = processDeathQueue(
      makeDeathState(players, {
        pendingDeaths: [{ playerId: janghwa.id, cause: 'DAY_EXECUTION', applied: false }],
      }),
    );
    expect(result.awaiting).toEqual({ kind: 'GRUDGE', playerId: janghwa.id });
  });

  it('장화홍련이 멸망꽃으로 사망하면 유서 기회 자체가 없다 (봉인)', () => {
    const players = makePlayers();
    const janghwa = byChar(players, 'janghwa');
    const death: PendingDeath = { playerId: janghwa.id, cause: 'DOOM_FLOWER', applied: false };
    expect(
      computeDeathTriggers(makeDeathState(players), janghwa, death),
    ).not.toContain('GRUDGE');
    const result = processDeathQueue(makeDeathState(players, { pendingDeaths: [death] }));
    expect(result.awaiting).toBeNull();
  });

  it('조언자 사망 → 승계/파기 입력 대기(SUCCESSION)', () => {
    const players = makePlayers();
    const haetae = byChar(players, 'haetae');
    const result = processDeathQueue(
      makeDeathState(players, {
        advisorId: haetae.id,
        pendingDeaths: [{ playerId: haetae.id, cause: 'EVIL_NIGHT_KILL', applied: true }],
      }),
    );
    expect(result.awaiting).toEqual({ kind: 'SUCCESSION', playerId: haetae.id });
  });

  it('까치선비 사망 + 바리공주 생존 → 연민 부활 예약, 양쪽 스킬 소모 (원인 불문)', () => {
    const players = makePlayers();
    const kkachi = byChar(players, 'kkachi');
    const result = processDeathQueue(
      makeDeathState(players, {
        pendingDeaths: [{ playerId: kkachi.id, cause: 'TAKE_ALONG', applied: false }],
      }),
    );
    expect(result.scheduledRevivals).toEqual([kkachi.id]);
    expect(result.players.find((p) => p.characterId === 'kkachi')?.skillUses.gratitude).toBe(1);
    expect(result.players.find((p) => p.characterId === 'baridegi')?.skillUses.compassion).toBe(1);
  });

  it('바리공주가 이미 사망했으면 까치선비 부활 예약 없음', () => {
    const players = makePlayers().map((p) =>
      p.characterId === 'baridegi' ? { ...p, alive: false } : p,
    );
    const kkachi = byChar(players, 'kkachi');
    const result = processDeathQueue(
      makeDeathState(players, {
        pendingDeaths: [{ playerId: kkachi.id, cause: 'DAY_EXECUTION', applied: false }],
      }),
    );
    expect(result.scheduledRevivals).toEqual([]);
  });
});
