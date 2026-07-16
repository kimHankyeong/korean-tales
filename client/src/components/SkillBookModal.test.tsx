import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SkillBookModal } from './SkillBookModal';

afterEach(cleanup);

describe('직업 설명(스킬북) 모달 (requirements 6번)', () => {
  it('최신 로스터 9개 캐릭터가 표시된다 — 깡철이 포함, 수살귀 없음', () => {
    render(<SkillBookModal onClose={() => {}} />);
    for (const name of [
      '저승사자', '깡철이', '구미호', '자청비', '해태', '도깨비', '장화홍련', '바리공주', '까치선비',
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.queryByText('수살귀')).toBeNull(); // 레거시 캐릭터 미노출
  });

  it('캐릭터 일러스트 사진이 표시된다 (깡철이는 미제작 — 이니셜 대체)', () => {
    render(<SkillBookModal onClose={() => {}} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBe(8); // 9종 중 깡철이만 일러스트 없음
    expect(screen.getByAltText('저승사자 일러스트')).toBeTruthy();
    expect(screen.getByAltText('구미호 일러스트')).toBeTruthy();
  });

  it('스킬명·사용 횟수와 진영별 승리 조건이 표시된다', () => {
    render(<SkillBookModal onClose={() => {}} />);
    expect(screen.getByText('저승길 동무')).toBeTruthy();
    expect(screen.getByText('재앙무죄')).toBeTruthy();
    expect(screen.getByText('투사')).toBeTruthy();
    expect(screen.getByText(/악 진영 전원 탈락, 또는 악 진영 전원이 항복/)).toBeTruthy();
  });

  it('닫기 버튼이 onClose를 호출한다', () => {
    const onClose = vi.fn();
    render(<SkillBookModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
