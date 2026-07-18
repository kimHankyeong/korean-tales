/**
 * 화면 중앙 4초 발표 문구 — 길동무 동반 사망("저승사자가 길동무로 n번을 선택했습니다"),
 * 유서 대상 지목("유서에 쓰인 건 n번입니다"), 해태 투사 결과("n번은 악 진영입니다") 공용.
 * store.announcement가 바뀔 때마다(id 변경) 4초 타이머를 새로 걸고 자동으로 지운다.
 */

import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

const DISPLAY_MS = 4000;

export function AnnouncementToast() {
  const announcement = useGameStore((s) => s.announcement);
  const clearAnnouncement = useGameStore((s) => s.clearAnnouncement);

  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => clearAnnouncement(), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [announcement, clearAnnouncement]);

  if (!announcement) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center px-4">
      <div
        role="status"
        className="pointer-events-none rounded-xl border border-amber-500/60 bg-slate-900/95 px-6 py-4 text-center text-base font-bold text-amber-200 shadow-2xl"
      >
        {announcement.text}
      </div>
    </div>
  );
}
