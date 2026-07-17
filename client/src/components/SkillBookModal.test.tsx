import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SkillBookModal } from './SkillBookModal';

afterEach(cleanup);

describe('직업 설명(스킬북) 모달 (requirements 6번)', () => {
  it('진영 탭을 넘기면 해당 진영 캐릭터 탭만 표시된다 — 깡철이 포함, 수살귀 없음', () => {
    render(<SkillBookModal onClose={() => {}} />);
    // 기본 선택: 악 진영
    for (const name of ['저승사자', '깡철이', '구미호']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
    expect(screen.queryByText('수살귀')).toBeNull(); // 레거시 캐릭터 미노출

    fireEvent.click(screen.getByRole('tab', { name: '선 진영' }));
    // 까치선비는 선 진영 소속으로 시작해 '까치의 보은' 부활 시에만 중립으로 전환된다
    for (const name of ['자청비', '해태', '도깨비', '장화홍련', '까치선비']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('tab', { name: '중립' }));
    expect(screen.getByRole('tab', { name: '바리공주' })).toBeTruthy();
  });

  it('캐릭터를 선택하면 3:5 비율 일러스트와 스킬 설명이 표시된다', () => {
    render(<SkillBookModal onClose={() => {}} />);
    // 기본 선택된 캐릭터(저승사자) 일러스트
    expect(screen.getByAltText('저승사자 일러스트')).toBeTruthy();
    expect(screen.getByText('저승길 동무')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '깡철이' }));
    expect(screen.getByAltText('깡철이 일러스트')).toBeTruthy();
    expect(screen.getByText('재앙무죄')).toBeTruthy();
    expect(screen.queryByText('저승길 동무')).toBeNull(); // 다른 캐릭터 스킬은 숨겨짐
  });

  it('진영별 승리 조건이 표시된다', () => {
    render(<SkillBookModal onClose={() => {}} />);
    // 기본 선택: 악 진영 — 상대인 선 진영 전멸/항복이 악 진영의 승리 조건
    expect(screen.getByText(/선 진영 전원 탈락, 또는 선 진영 전원이 항복/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '선 진영' }));
    expect(screen.getByText(/악 진영 전원 탈락, 또는 악 진영 전원이 항복/)).toBeTruthy();
    expect(screen.getByText(/선 진영 승리 조건/)).toBeTruthy();
  });

  it('닫기 버튼이 onClose를 호출한다', () => {
    const onClose = vi.fn();
    render(<SkillBookModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
