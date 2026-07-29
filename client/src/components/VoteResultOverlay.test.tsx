import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { PublicPlayerState } from '@korean-tales/shared';
import { VoteResultOverlay } from './VoteResultOverlay';
import { useGameStore } from '../store/gameStore';

const players: PublicPlayerState[] = [
  { id: 'p1', name: '달래', seat: 1, alive: true, avatarUrl: null },
  { id: 'p3', name: '초롱', seat: 3, alive: true, avatarUrl: null },
  { id: 'p5', name: '바우', seat: 5, alive: true, avatarUrl: null },
];

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ players });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGameStore.setState({ voteResult: null, players: [] });
});

describe('VoteResultOverlay — 투표 결과 5초 공개 (9번 피드백)', () => {
  it('voteResult가 없으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<VoteResultOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('대상별로 투표자를 묶어 화살표로 보여주고, 지정 시간 뒤 자동으로 사라진다', () => {
    render(<VoteResultOverlay />);
    act(() =>
      useGameStore.getState().applyVoteResult({
        votes: { p1: 'ABSTAIN', p3: 'p5', p5: 'p5' },
        durationMs: 3000,
      }),
    );

    // 5번(바우)에게 3번·5번이 투표 — 같은 줄에 묶여 표시
    const items = screen.getAllByRole('listitem');
    const targetRow = items.find((li) => li.textContent?.includes('바우'))!;
    expect(targetRow.textContent).toContain('3번');
    expect(targetRow.textContent).toContain('초롱');
    expect(targetRow.textContent).toContain('5번');
    expect(targetRow.textContent).toContain('바우');
    // 좌석 번호는 파란색으로 강조 표시된다
    expect(targetRow.querySelectorAll('.text-blue-400').length).toBeGreaterThan(0);
    expect(screen.getByText('기권')).toBeTruthy();

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText('기권')).toBeNull();
  });

  it('durationMs 미지정 시 기본 5초가 적용된다', () => {
    render(<VoteResultOverlay />);
    act(() => useGameStore.getState().applyVoteResult({ votes: { p1: 'p3' } }));
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getAllByRole('listitem')[0]!.textContent).toContain('초롱');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
