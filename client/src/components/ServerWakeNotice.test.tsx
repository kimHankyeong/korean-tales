import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ServerWakeNotice } from './ServerWakeNotice';

afterEach(cleanup);

/** 수동 해제 가능한 fetch 목 */
function deferredFetch() {
  let resolve!: (value: { ok: boolean }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ ok: boolean }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const fetchFn = vi.fn(() => promise);
  return { fetchFn, resolve, reject };
}

describe('무료 티어 콜드스타트 안내 (requirements 12번)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('응답이 빠르면 배너를 표시하지 않는다', async () => {
    const { fetchFn, resolve } = deferredFetch();
    render(<ServerWakeNotice healthUrl="http://test/health" fetchFn={fetchFn} />);
    await act(async () => {
      resolve({ ok: true });
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('응답이 늦으면 "서버를 깨우는 중" 배너가 뜨고, 깨어나면 사라진다', async () => {
    const { fetchFn, resolve } = deferredFetch();
    render(<ServerWakeNotice healthUrl="http://test/health" fetchFn={fetchFn} />);

    // 1.5초 경과 — 아직 응답 없음 → 배너 표시
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(screen.getByRole('status').textContent).toContain('서버를 깨우는 중입니다');

    // 콜드스타트 완료 → 배너 제거
    await act(async () => {
      resolve({ ok: true });
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('핑 실패 시 재시도하고, 최대 대기시간을 넘기면 연결 실패 안내로 바뀐다', async () => {
    let attempts = 0;
    const fetchFn = vi.fn(() => {
      attempts += 1;
      return Promise.reject(new Error('sleeping'));
    });
    render(
      <ServerWakeNotice
        healthUrl="http://test/health"
        fetchFn={fetchFn}
        retryDelayMs={1_000}
        maxWaitMs={5_000}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(attempts).toBeGreaterThanOrEqual(2); // 재시도 확인
    expect(screen.getByRole('status').textContent).toContain('깨우는 중');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole('status').textContent).toContain('서버에 연결할 수 없습니다');
  });
});
