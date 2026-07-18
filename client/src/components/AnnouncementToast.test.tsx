import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AnnouncementToast } from './AnnouncementToast';
import { useGameStore } from '../store/gameStore';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGameStore.setState({ announcement: null });
});

describe('AnnouncementToast — 화면 중앙 4초 발표 문구 (13번)', () => {
  it('announcement가 없으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<AnnouncementToast />);
    expect(container.firstChild).toBeNull();
  });

  it('announcement가 설정되면 문구가 표시되고, 4초 후 자동으로 사라진다', () => {
    render(<AnnouncementToast />);
    act(() => useGameStore.getState().setAnnouncement('저승사자가 길동무로 3번을 선택했습니다'));
    expect(screen.getByText('저승사자가 길동무로 3번을 선택했습니다')).toBeTruthy();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('저승사자가 길동무로 3번을 선택했습니다')).toBeNull();
  });

  it('같은 문구가 다시 와도(id가 새로 부여되어) 4초 타이머가 새로 걸린다', () => {
    render(<AnnouncementToast />);
    act(() => useGameStore.getState().setAnnouncement('유서에 쓰인 건 2번입니다'));
    act(() => vi.advanceTimersByTime(3000));
    act(() => useGameStore.getState().setAnnouncement('유서에 쓰인 건 2번입니다')); // 3초 시점에 재설정
    act(() => vi.advanceTimersByTime(3000)); // 최초 기준 6초 경과 — 재설정 안 됐다면 이미 사라졌을 시점
    expect(screen.getByText('유서에 쓰인 건 2번입니다')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000)); // 재설정 시점 기준 4초 경과
    expect(screen.queryByText('유서에 쓰인 건 2번입니다')).toBeNull();
  });
});
