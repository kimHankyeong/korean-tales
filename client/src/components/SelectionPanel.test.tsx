import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { SelectionPanel, type SelectablePlayer } from './SelectionPanel';

afterEach(cleanup);

const players: SelectablePlayer[] = [
  { id: 'p1', seat: 1, name: '달래', alive: true },
  { id: 'p2', seat: 2, name: '바우', alive: true },
  { id: 'p3', seat: 3, name: '초롱', alive: false }, // 사망자 — 목록 제외 대상
];

describe('투표/스킬 선택 공용 컴포넌트 (requirements 6번)', () => {
  it('생존자만 번호와 함께 나열된다', () => {
    render(<SelectionPanel title="처형 투표" players={players} buttonLabel="투표하기" onConfirm={() => {}} />);
    expect(screen.getByText('1번')).toBeTruthy();
    expect(screen.getByText('2번')).toBeTruthy();
    expect(screen.queryByText('3번')).toBeNull(); // 사망자 미표시
  });

  it('프로필 클릭 전에는 확정 버튼이 비활성, 클릭 후 활성화된다', () => {
    const onConfirm = vi.fn();
    render(<SelectionPanel title="처형 투표" players={players} buttonLabel="투표하기" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: '투표하기' });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('2번'));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('p2');
  });

  it('버튼 텍스트가 props로 분기된다 (투표하기/선택하기)', () => {
    render(<SelectionPanel title="투사" players={players} buttonLabel="선택하기" onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: '선택하기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '투표하기' })).toBeNull();
  });

  it('기권 옵션: allowAbstain일 때만 표시되고 ABSTAIN으로 확정된다', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <SelectionPanel title="처형 투표" players={players} buttonLabel="투표하기" allowAbstain onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByText('기권'));
    fireEvent.click(screen.getByRole('button', { name: '투표하기' }));
    expect(onConfirm).toHaveBeenCalledWith('ABSTAIN');

    rerender(<SelectionPanel title="처형 투표" players={players} buttonLabel="투표하기" onConfirm={onConfirm} />);
    expect(screen.queryByText('기권')).toBeNull();
  });

  it('스킬 포기 버튼: allowForgo일 때만 표시되고 onForgo를 호출한다', () => {
    const onForgo = vi.fn();
    render(
      <SelectionPanel
        title="피 맺힌 유서"
        players={players}
        buttonLabel="선택하기"
        allowForgo
        onConfirm={() => {}}
        onForgo={onForgo}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '스킬 포기' }));
    expect(onForgo).toHaveBeenCalledTimes(1);
  });

  it('입력 순서와 무관하게 번호 오름차순으로 정렬되어 나열된다', () => {
    const shuffled: SelectablePlayer[] = [
      { id: 'p9', seat: 9, name: '아홉', alive: true },
      { id: 'p2', seat: 2, name: '바우', alive: true },
      { id: 'p5', seat: 5, name: '다섯', alive: true },
    ];
    render(<SelectionPanel title="처형 투표" players={shuffled} buttonLabel="투표하기" onConfirm={() => {}} />);
    const seats = screen.getAllByText(/^\d+번$/).map((el) => el.textContent);
    expect(seats).toEqual(['2번', '5번', '9번']);
  });

  it('확정 버튼을 누르면 "완료"로 바뀌고 다시 눌러도 onConfirm이 재호출되지 않는다 (클릭이 반영됐는지 알 수 없다는 피드백)', () => {
    const onConfirm = vi.fn();
    render(<SelectionPanel title="처형 투표" players={players} buttonLabel="투표하기" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('1번'));
    const button = screen.getByRole('button', { name: '투표하기' });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const doneButton = screen.getByRole('button', { name: '완료' }) as HTMLButtonElement;
    expect(doneButton.disabled).toBe(true);
    fireEvent.click(doneButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disabledIds 대상은 선택할 수 없다', () => {
    const onConfirm = vi.fn();
    render(
      <SelectionPanel
        title="투사"
        players={players}
        buttonLabel="선택하기"
        disabledIds={['p1']}
        onConfirm={onConfirm}
      />,
    );
    const self = screen.getByText('1번').closest('button')!;
    expect((self as HTMLButtonElement).disabled).toBe(true);
  });
});
