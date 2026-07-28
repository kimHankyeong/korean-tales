/**
 * 액션 반려 토스트 — 서버 상태머신 guard가 조용히 거부한 액션(ACTION_REJECTED)을
 * 화면 하단에 짧게 알려준다. 예전엔 이런 경우도 성공 ack만 와서 "눌렀는데 반영 안 됨"으로
 * 보였다(자청비 부활꽃/멸망꽃, 장화홍련 유서 등에서 제보). store.actionError가 바뀔
 * 때마다(id 변경) 타이머를 새로 걸고 자동으로 지운다.
 */

import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

export function ActionErrorToast() {
  const actionError = useGameStore((s) => s.actionError);
  const clearActionError = useGameStore((s) => s.clearActionError);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => clearActionError(), 2500);
    return () => clearTimeout(timer);
  }, [actionError, clearActionError]);

  if (!actionError) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-none rounded-lg border border-red-500/60 bg-slate-900/95 px-4 py-2 text-center text-sm font-semibold text-red-300 shadow-2xl"
      >
        {actionError.text}
      </div>
    </div>
  );
}
