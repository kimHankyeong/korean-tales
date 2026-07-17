import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@korean-tales/shared';
import {
  canUseSkill,
  canVoteInElection,
  checkWin,
  compassionApplies,
  computeDeathTriggers,
  computeSpeechOrder,
  investigate,
  isRevivableTonight,
  isTakeAlongSealed,
  processDeathQueue,
  resolveElectionVote,
  resolveExecutionVote,
  resolveNightKillOutcome,
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

describe('처형 투표 판정 — resolveExecutionVote (requirements 5-4항)', () => {
  it('1차: 전원 기권 → 무처형 (밤 전환)', () => {
    expect(resolveExecutionVote({ a: 'ABSTAIN', b: 'ABSTAIN' }, 1)).toEqual({
      kind: 'NO_EXECUTION',
    });
  });

  it('1차: 기권표가 다수여도 1표라도 있으면 최다득표자 처형', () => {
    expect(
      resolveExecutionVote({ a: 'ABSTAIN', b: 'ABSTAIN', c: 'ABSTAIN', d: 'x' }, 1),
    ).toEqual({ kind: 'EXECUTE', targetId: 'x' });
  });

  it('1차: 동표 → 최다득표자 동시 발언(TIE_SPEECH)', () => {
    const result = resolveExecutionVote({ a: 'x', b: 'y' }, 1);
    expect(result.kind).toBe('TIE_SPEECH');
    if (result.kind === 'TIE_SPEECH') expect(result.candidates.sort()).toEqual(['x', 'y']);
  });

  it('재투표: 재동표 → 최다득표자 중 무작위(EXECUTE_RANDOM)', () => {
    const result = resolveExecutionVote({ a: 'x', b: 'y' }, 2, ['x', 'y']);
    expect(result.kind).toBe('EXECUTE_RANDOM');
    if (result.kind === 'EXECUTE_RANDOM') expect(result.pool.sort()).toEqual(['x', 'y']);
  });

  it('재투표: 전원 기권도 동표 후보 중 무작위로 수렴', () => {
    const result = resolveExecutionVote({ a: 'ABSTAIN' }, 2, ['x', 'y']);
    expect(result).toEqual({ kind: 'EXECUTE_RANDOM', pool: ['x', 'y'] });
  });
});

describe('조언자 선출 투표 판정 — resolveElectionVote (requirements 7번, 동표 로직 재사용)', () => {
  const candidates = ['c1', 'c2', 'c3'];

  it('단독 최다 득표자가 조언자로 확정된다', () => {
    expect(resolveElectionVote({ a: 'c1', b: 'c1', c: 'c2' }, 1, { candidates })).toEqual({
      kind: 'ELECTED',
      advisorId: 'c1',
    });
  });

  it('1차 동표 → 동표자만 후보로 재투표(REVOTE) — 처형과 동일한 규칙', () => {
    const result = resolveElectionVote({ a: 'c1', b: 'c2' }, 1, { candidates });
    expect(result.kind).toBe('REVOTE');
    if (result.kind === 'REVOTE') expect(result.candidates.sort()).toEqual(['c1', 'c2']);
  });

  it('무득표 → 후보 중 무작위(ELECT_RANDOM)', () => {
    expect(resolveElectionVote({}, 1, { candidates })).toEqual({
      kind: 'ELECT_RANDOM',
      pool: candidates,
    });
  });

  it('재투표 동표 → 무작위(ELECT_RANDOM)', () => {
    const result = resolveElectionVote({ a: 'c1', b: 'c2' }, 2, {
      candidates,
      tieCandidates: ['c1', 'c2'],
    });
    expect(result.kind).toBe('ELECT_RANDOM');
  });

  it('출마자에게는 투표권이 없다 (canVoteInElection)', () => {
    const players = makePlayers();
    expect(canVoteInElection(players, 'p1', ['p1', 'p2'])).toBe(false); // 출마자
    expect(canVoteInElection(players, 'p3', ['p1', 'p2'])).toBe(true);
    const dead = players.map((p) => (p.id === 'p3' ? { ...p, alive: false } : p));
    expect(canVoteInElection(dead, 'p3', ['p1', 'p2'])).toBe(false); // 사망자
  });
});

describe('스킬 상호작용 판정 (requirements 3·4·5번)', () => {
  it('도깨비 보호 성공: 밤 킬 무효 — 공지는 킬 없음과 동일한 "사망자 없음" (차단 비공개)', () => {
    const players = makePlayers();
    const protectedOutcome = resolveNightKillOutcome(players, 'p5', 'p5');
    const noKill = resolveNightKillOutcome(players, null, null);
    expect(protectedOutcome).toEqual({
      killedPlayerId: null,
      announcement: 'NO_DEATH',
      protectionSucceeded: true,
    });
    // 악 진영이 공지(킬 대상 여부·announcement)로 차단 여부를 구분할 수 없어야 함
    expect(protectedOutcome.killedPlayerId).toBe(noKill.killedPlayerId);
    expect(protectedOutcome.announcement).toBe(noKill.announcement);
  });

  it('보호 대상이 킬 대상과 다르면(또는 미지정이면) 밤 킬은 정상 반영되고 보호는 실패로 기록된다', () => {
    expect(resolveNightKillOutcome(makePlayers(), 'p5', null)).toEqual({
      killedPlayerId: 'p5',
      announcement: 'DEATH',
      protectionSucceeded: false,
    });
    expect(resolveNightKillOutcome(makePlayers(), 'p5', 'p6')).toEqual({
      killedPlayerId: 'p5',
      announcement: 'DEATH',
      protectionSucceeded: false,
    });
  });

  it('부활꽃 대상: 그날 밤 악 킬 사망자만 — 동반사망자·처형자·유서 사망자는 제외', () => {
    const deaths = (cause: PendingDeath['cause']): PendingDeath[] => [
      { playerId: 'x', cause, applied: true },
    ];
    expect(isRevivableTonight(deaths('EVIL_NIGHT_KILL'), 'x')).toBe(true);
    expect(isRevivableTonight(deaths('COMPANION_DEATH'), 'x')).toBe(false); // 저승길 동무 동반
    expect(isRevivableTonight(deaths('TAKE_ALONG'), 'x')).toBe(false); // 피 맺힌 유서 동반
    expect(isRevivableTonight(deaths('DAY_EXECUTION'), 'x')).toBe(false); // 낮 투표 처형자
    expect(isRevivableTonight(deaths('DOOM_FLOWER'), 'x')).toBe(false); // 멸망꽃
  });

  it('연민: 까치선비 한정 — 바리공주 생존 시에만, 다른 캐릭터에는 적용 불가', () => {
    const players = makePlayers();
    const kkachi = byChar(players, 'kkachi');
    expect(compassionApplies(players, kkachi)).toBe(true);
    expect(compassionApplies(players, byChar(players, 'haetae'))).toBe(false); // 대상 아님
    const baridegiDead = players.map((p) =>
      p.characterId === 'baridegi' ? { ...p, alive: false } : p,
    );
    expect(compassionApplies(baridegiDead, kkachi)).toBe(false);
    // 이미 소모된 경우 재발동 불가
    expect(compassionApplies(players, { ...kkachi, skillUses: { gratitude: 1 } })).toBe(false);
  });

  it('멸망꽃 사망 → 동귀어진류(피 맺힌 유서) 봉인, 그 외 원인은 봉인 없음', () => {
    const janghwa = byChar(makePlayers(), 'janghwa');
    expect(isTakeAlongSealed(janghwa, 'DOOM_FLOWER')).toBe(true);
    expect(isTakeAlongSealed(janghwa, 'DAY_EXECUTION')).toBe(false);
    expect(isTakeAlongSealed(janghwa, 'COMPANION_DEATH')).toBe(false); // 동반 사망은 봉인 아님
    expect(isTakeAlongSealed(byChar(makePlayers(), 'haetae'), 'DOOM_FLOWER')).toBe(false); // 스킬 미보유
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
