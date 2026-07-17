/** 모달 좌상단 X 닫기 버튼 — 부모 컨테이너가 `relative`여야 위치가 맞는다. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="닫기"
      className="absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-full border border-slate-500 bg-slate-800/80 text-lg leading-none text-slate-300 hover:bg-slate-700"
    >
      ×
    </button>
  );
}
