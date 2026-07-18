import { describe, expect, it } from 'vitest';
import { CHARACTER_BY_ID, ROSTER_BY_MODE } from '@korean-tales/shared';
import { assignCharacters, type AssignmentRequest } from './assign';

function requests(count: number, preference: (i: number) => AssignmentRequest['factionPreference']): AssignmentRequest[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `p${i + 1}`,
    factionPreference: preference(i),
  }));
}

/** 결정적이지만 다양한 값을 내는 유사 rng */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe('캐릭터 무작위 배정 (진영 선호 반영)', () => {
  it('9인 모드: 전원에게 로스터의 9개 캐릭터가 중복 없이 배정된다', () => {
    const result = assignCharacters(requests(9, () => null), 9, seededRng(1));
    const assigned = Object.values(result);
    expect(new Set(assigned).size).toBe(9);
    expect(new Set(assigned)).toEqual(new Set(ROSTER_BY_MODE[9]));
  });

  it('7인 모드: 7인 로스터로만 배정된다', () => {
    const result = assignCharacters(requests(7, () => null), 7, seededRng(2));
    expect(new Set(Object.values(result))).toEqual(new Set(ROSTER_BY_MODE[7]));
  });

  it('인원수가 모드와 다르면 에러', () => {
    expect(() => assignCharacters(requests(8, () => null), 9, seededRng(3))).toThrow();
  });

  it('allowUnderstaffed=true면 정원 미달도 로스터 일부만 무작위 배정된다 (13번 관리자 우회)', () => {
    const result = assignCharacters(requests(1, () => null), 9, seededRng(4), true);
    const assigned = Object.values(result);
    expect(assigned.length).toBe(1);
    expect(ROSTER_BY_MODE[9]).toContain(assigned[0]);
  });

  it('allowUnderstaffed=true여도 로스터보다 많으면 여전히 에러', () => {
    expect(() => assignCharacters(requests(10, () => null), 9, seededRng(5), true)).toThrow();
  });

  it('fixedAssignments로 지정한 플레이어는 항상 그 캐릭터로 배정된다 (13번 관리자 직업 선택)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = assignCharacters(requests(9, () => null), 9, seededRng(seed), false, {
        p1: 'dokkaebi',
      });
      expect(result.p1).toBe('dokkaebi');
      expect(new Set(Object.values(result)).size).toBe(9); // 나머지도 중복 없이 배정
    }
  });

  it('fixedAssignments가 정원 미달과 함께 쓰여도 나머지는 남은 로스터에서 배정된다', () => {
    const result = assignCharacters(requests(1, () => null), 9, seededRng(1), true, {
      p1: 'jacheongbi',
    });
    expect(result).toEqual({ p1: 'jacheongbi' });
  });

  it('fixedAssignments에 로스터에 없는 캐릭터가 지정되면 무시하고 일반 배정한다', () => {
    // 7인 모드에는 없는 캐릭터(까치선비 — 9인 전용)를 억지로 지정
    const result = assignCharacters(requests(7, () => null), 7, seededRng(1), false, {
      p1: 'kkachi',
    });
    expect(result.p1).not.toBe('kkachi');
    expect(new Set(Object.values(result)).size).toBe(7);
  });

  it('선호 진영 슬롯이 남아 있으면 선호가 반영된다', () => {
    // 1명만 EVIL 선호 — 악 슬롯 3개이므로 항상 반영
    for (let seed = 1; seed <= 20; seed++) {
      const result = assignCharacters(
        requests(9, (i) => (i === 0 ? 'EVIL' : null)),
        9,
        seededRng(seed),
      );
      expect(CHARACTER_BY_ID[result.p1!].faction).toBe('EVIL');
    }
  });

  it('선호자가 슬롯보다 많으면 일부만 반영된다 (배정은 무작위 기반 — 보장 아님)', () => {
    // 9명 전원 EVIL 선호 — 악 진영은 3자리뿐
    const result = assignCharacters(requests(9, () => 'EVIL'), 9, seededRng(7));
    const evilCount = Object.values(result).filter(
      (c) => CHARACTER_BY_ID[c].faction === 'EVIL',
    ).length;
    expect(evilCount).toBe(3); // 로스터 구조상 3명만 악
    expect(new Set(Object.values(result)).size).toBe(9); // 전원 배정
  });

  it('선호 반영 순서는 입장 순서가 아니라 무작위다', () => {
    // 전원 GOOD 선호(9인 모드 선 5자리) — 시드에 따라 반영되는 사람이 달라져야 함
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const result = assignCharacters(requests(9, () => 'GOOD'), 9, seededRng(seed));
      const goodPlayers = Object.entries(result)
        .filter(([, c]) => CHARACTER_BY_ID[c].faction === 'GOOD')
        .map(([id]) => id)
        .sort()
        .join(',');
      outcomes.add(goodPlayers);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });
});
