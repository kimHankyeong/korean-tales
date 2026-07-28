import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ActionErrorToast } from './ActionErrorToast';
import { useGameStore } from '../store/gameStore';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGameStore.setState({ actionError: null });
});

describe('ActionErrorToast — 액션 반려 2.5초 안내 (ACTION_REJECTED)', () => {
  it('actionError가 없으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<ActionErrorToast />);
    expect(container.firstChild).toBeNull();
  });

  it('actionError가 설정되면 문구가 표시되고, 2.5초 후 자동으로 사라진다', () => {
    render(<ActionErrorToast />);
    act(() => useGameStore.getState().setActionError('지금은 반영할 수 없어요'));
    expect(screen.getByText('지금은 반영할 수 없어요')).toBeTruthy();

    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByText('지금은 반영할 수 없어요')).toBeNull();
  });
});
