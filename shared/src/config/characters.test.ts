import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_BY_ID, FACTION_META } from './characters';
import { ROSTER_BY_MODE } from './roster';

// 데이터 정합성 검증 — docs/requirements.md 3번 섹션 기준

describe('캐릭터 데이터 모델', () => {
  it('9개 캐릭터가 정의되어 있다', () => {
    expect(CHARACTERS).toHaveLength(9);
  });

  it('id가 중복되지 않는다', () => {
    const ids = CHARACTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('진영 구성: 악 3 / 선 5(까치선비 포함) / 중립 1', () => {
    const count = (faction: string) => CHARACTERS.filter((c) => c.faction === faction).length;
    expect(count('EVIL')).toBe(3);
    expect(count('GOOD')).toBe(5);
    expect(count('NEUTRAL')).toBe(1);
  });

  it('악·선 진영에는 승리 조건이 정의되어 있다', () => {
    expect(FACTION_META.EVIL.winCondition).toBeTruthy();
    expect(FACTION_META.GOOD.winCondition).toBeTruthy();
  });

  it('모든 캐릭터에 배경설화(lore)가 있다', () => {
    for (const c of CHARACTERS) expect(c.lore.length).toBeGreaterThan(0);
  });

  it('자청비만 스킬을 2개 가진다', () => {
    expect(CHARACTER_BY_ID.jacheongbi.skills).toHaveLength(2);
    for (const c of CHARACTERS) {
      if (c.id !== 'jacheongbi') expect(c.skills.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('특수 규칙 필드', () => {
  it('깡철이는 악 진영이지만 투사에 NOT_EVIL로 표시된다', () => {
    expect(CHARACTER_BY_ID.kkangcheol.faction).toBe('EVIL');
    expect(CHARACTER_BY_ID.kkangcheol.investigationResult).toBe('NOT_EVIL');
  });

  it('깡철이 외 악 진영은 EVIL로 표시된다', () => {
    expect(CHARACTER_BY_ID.jeoseung.investigationResult).toBe('EVIL');
    expect(CHARACTER_BY_ID.gumiho.investigationResult).toBe('EVIL');
  });

  it('부활꽃은 악 진영 밤 킬 사망자만, 연민은 원인 불문으로 부활시킨다', () => {
    const revivalFlower = CHARACTER_BY_ID.jacheongbi.skills.find((s) => s.id === 'revival-flower');
    expect(revivalFlower?.revivableCauses).toEqual(['EVIL_NIGHT_KILL']);
    const compassion = CHARACTER_BY_ID.baridegi.skills[0];
    expect(compassion?.revivableCauses).toBe('ANY');
  });

  it('피 맺힌 유서는 멸망꽃 사망 시 봉인되고, 포기 가능하다', () => {
    const grudge = CHARACTER_BY_ID.janghwa.skills[0];
    expect(grudge?.sealedByDeathCauses).toEqual(['DOOM_FLOWER']);
    expect(grudge?.canForgo).toBe(true);
  });

  it('패시브 스킬(재앙무죄·연민·까치의 보은)은 timing이 없다', () => {
    for (const id of ['kkangcheol', 'baridegi', 'kkachi'] as const) {
      const skill = CHARACTER_BY_ID[id].skills[0];
      expect(skill?.isPassive).toBe(true);
      expect(skill?.timing).toBeUndefined();
    }
  });

  it('까치의 보은은 부활 시 중립으로 전환된다', () => {
    expect(CHARACTER_BY_ID.kkachi.skills[0]?.convertsToFactionOnRevive).toBe('NEUTRAL');
  });
});

describe('모드별 로스터', () => {
  it('9인 모드 로스터는 정의된 9개 캐릭터와 정확히 일치한다', () => {
    expect(new Set(ROSTER_BY_MODE[9])).toEqual(new Set(CHARACTERS.map((c) => c.id)));
  });

  it('7인 모드 로스터는 깡철이·까치선비를 제외한 7인 구성이다', () => {
    const roster = ROSTER_BY_MODE[7];
    expect(roster).toHaveLength(7);
    expect(roster).not.toContain('kkangcheol');
    expect(roster).not.toContain('kkachi');
    // 전원이 정의된 캐릭터여야 함
    const all = new Set(CHARACTERS.map((c) => c.id));
    for (const id of roster) expect(all.has(id)).toBe(true);
  });
});
