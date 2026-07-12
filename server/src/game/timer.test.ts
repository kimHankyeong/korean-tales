import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhaseTimer } from './timer';

describe('PhaseTimer (서버 권위 타이머)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('만료 시 onExpire를 정확히 1회 호출한다', () => {
    const timer = new PhaseTimer();
    const onExpire = vi.fn();
    timer.start('vote', 10_000, onExpire);
    vi.advanceTimersByTime(9_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(timer.isRunning).toBe(false);
  });

  it('cancel 후에는 만료 콜백이 호출되지 않는다', () => {
    const timer = new PhaseTimer();
    const onExpire = vi.fn();
    timer.start('vote', 10_000, onExpire);
    timer.cancel();
    vi.advanceTimersByTime(20_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('새 타이머 시작 시 기존 타이머는 자동 취소된다', () => {
    const timer = new PhaseTimer();
    const first = vi.fn();
    const second = vi.fn();
    timer.start('a', 5_000, first);
    timer.start('b', 5_000, second);
    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('remainingMs는 경과에 따라 줄어든다', () => {
    const timer = new PhaseTimer();
    timer.start('a', 10_000, () => {});
    expect(timer.remainingMs()).toBe(10_000);
    vi.advanceTimersByTime(4_000);
    expect(timer.remainingMs()).toBe(6_000);
  });
});
