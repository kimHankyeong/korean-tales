import { describe, expect, it } from 'vitest';
import { formatCountdown, formatSpeechOrderLabel } from './format';

describe('표시 문구 포맷 (requirements 6번)', () => {
  it('발언 순서: (해)낮-개인발언시간-번호 형식', () => {
    expect(formatSpeechOrderLabel('DAY', 80, 1)).toBe('(해)낮-80초-1번');
    expect(formatSpeechOrderLabel('DAY', 120, 9)).toBe('(해)낮-120초-9번');
    expect(formatSpeechOrderLabel('NIGHT', 80, 3)).toBe('(달)밤-80초-3번');
  });

  it('카운트다운: 두 자리 0 패딩 + "초 남음"', () => {
    expect(formatCountdown('토론 시간', 90)).toBe('토론 시간 90초 남음');
    expect(formatCountdown('토론 시간', 5)).toBe('토론 시간 05초 남음');
    expect(formatCountdown('개인 발언 시간', 0)).toBe('개인 발언 시간 00초 남음');
    expect(formatCountdown('토론 시간', -3)).toBe('토론 시간 00초 남음'); // 음수 방어
  });
});
