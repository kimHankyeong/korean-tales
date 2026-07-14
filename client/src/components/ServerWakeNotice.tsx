/**
 * 무료 티어 콜드스타트 안내 — requirements 12번:
 * Render 무료 서버는 15분 무활동 시 슬립되어, 재접속 시 수십 초의 콜드스타트가 생긴다.
 * 로비 진입 시 /health를 핑해서 응답이 늦으면 "서버를 깨우는 중" 배너를 띄우고,
 * 깨어나면 자동으로 사라진다.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SERVER_URL } from '../lib/serverUrl';

export type WakeState = 'CHECKING' | 'WAKING' | 'READY' | 'UNREACHABLE';

export interface ServerWakeOptions {
  /** 이 시간 안에 응답이 없으면 "깨우는 중" 배너 표시 (기본 1.5초) */
  slowThresholdMs?: number;
  /** 핑 재시도 간격 (기본 3초) */
  retryDelayMs?: number;
  /** 이 시간까지 깨어나지 않으면 연결 실패로 간주 (기본 90초 — 콜드스타트 여유) */
  maxWaitMs?: number;
  /** 테스트용 fetch 주입 */
  fetchFn?: (url: string) => Promise<{ ok: boolean }>;
}

export function useServerWake(healthUrl: string, options: ServerWakeOptions = {}): WakeState {
  const {
    slowThresholdMs = 1_500,
    retryDelayMs = 3_000,
    maxWaitMs = 90_000,
    fetchFn = (url) => fetch(url),
  } = options;
  const [state, setState] = useState<WakeState>('CHECKING');

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    // 응답이 늦으면 "깨우는 중" 표시 (성공 시 아래에서 READY로 덮어씀)
    const slowTimer = setTimeout(() => {
      if (!cancelled) setState((s) => (s === 'CHECKING' ? 'WAKING' : s));
    }, slowThresholdMs);

    async function ping(): Promise<void> {
      try {
        const response = await fetchFn(healthUrl);
        if (cancelled) return;
        if (response.ok) {
          setState('READY');
          return;
        }
        throw new Error(`health ${String(response.ok)}`);
      } catch {
        if (cancelled) return;
        if (Date.now() - startedAt >= maxWaitMs) {
          setState('UNREACHABLE');
          return;
        }
        setTimeout(() => {
          if (!cancelled) void ping();
        }, retryDelayMs);
      }
    }

    void ping();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthUrl]);

  return state;
}

export function ServerWakeNotice({
  healthUrl = `${SERVER_URL}/health`,
  ...options
}: ServerWakeOptions & { healthUrl?: string }) {
  const state = useServerWake(healthUrl, options);

  if (state !== 'WAKING' && state !== 'UNREACHABLE') return null;

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-900/95 px-4 py-2 text-sm text-amber-100"
    >
      {state === 'WAKING' ? (
        <>
          {/* 스피너 */}
          <span
            aria-hidden
            className="inline-block size-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-transparent"
          />
          <span>
            서버를 깨우는 중입니다… 무료 서버는 잠들어 있으면 깨어나는 데 최대 1분 정도 걸릴 수
            있어요.
          </span>
        </>
      ) : (
        <span>서버에 연결할 수 없습니다. 잠시 후 페이지를 새로고침해 주세요.</span>
      )}
    </motion.div>
  );
}
