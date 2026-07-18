/**
 * 추측한 직업 아이콘 — 플레이어 목록의 프로필 사진 옆에 표시하는 개인 메모.
 * 아이콘은 독자적으로 그리지 않고 기기 키보드/OS의 이모지 입력을 그대로 쓴다
 * (모바일은 이모지 키보드, 데스크톱은 Win+.·Cmd+Ctrl+Space) — 별도 에셋·선택 UI
 * 없이 자유 입력만으로 구현되어 개발 비용이 훨씬 낮고, 본인만의 추리라 정해진
 * 아이콘 세트에 얽매일 필요도 없다. 서버에는 전송하지 않는 순수 클라이언트 메모.
 */

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export function SuspicionMark({ playerId }: { playerId: string }) {
  const mark = useGameStore((s) => s.suspicionMarks[playerId]);
  const setSuspicionMark = useGameStore((s) => s.setSuspicionMark);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mark ?? '');

  function commit() {
    setSuspicionMark(playerId, draft.trim() || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        maxLength={4}
        placeholder="🦊"
        aria-label="추측한 직업 아이콘 입력 (이모지 키보드 사용)"
        className="absolute -bottom-1 -right-1 z-10 h-4 w-8 rounded-full border border-amber-400 bg-slate-900 text-center text-[10px] leading-none text-slate-100 outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(mark ?? '');
        setEditing(true);
      }}
      aria-label={mark ? `추측 아이콘: ${mark} (탭하여 변경)` : '추측한 직업 아이콘 추가'}
      title="추측한 직업을 이모지로 표시해보세요"
      className="absolute -bottom-1 -right-1 z-10 grid size-4 place-items-center rounded-full bg-slate-950 text-[10px] leading-none ring-1 ring-slate-600 hover:ring-amber-400"
    >
      {mark || '+'}
    </button>
  );
}
