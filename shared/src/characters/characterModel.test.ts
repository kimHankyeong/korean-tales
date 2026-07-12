import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_BY_ID, FACTIONS } from './characterModel';

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
    expect(count('evil')).toBe(3);
    expect(count('good')).toBe(5);
    expect(count('neutral')).toBe(1);
  });

  it('악·선 진영에는 승리 조건이 정의되어 있다', () => {
    expect(FACTIONS.evil.winCondition).toBeTruthy();
    expect(FACTIONS.good.winCondition).toBeTruthy();
  });

  it('자청비만 스킬을 2개 가진다', () => {
    expect(CHARACTER_BY_ID.jacheongbi.skills).toHaveLength(2);
    for (const c of CHARACTERS) {
      if (c.id !== 'jacheongbi') expect(c.skills.length).toBeLessThanOrEqual(1);
    }
  });
});
