/** 화면 좌상단 뒤로가기 버튼 — 공개방 목록·방 안 화면 공용. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed left-4 top-4 z-50 rounded-full border border-slate-500 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-slate-200 shadow-lg hover:bg-slate-800"
    >
      ← 뒤로
    </button>
  );
}
