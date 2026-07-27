/**
 * 메모장 — 채팅창 옆 버튼으로 열고 닫는다. 언제든 자유롭게 문장을 적어두고, 줄마다
 * "채팅으로 보내기" 버튼으로 그 문장만 채팅에 전송할 수 있다(6번 UI/10번 피드백).
 * 서버에는 절대 전송되지 않는 순수 클라이언트 로컬 상태다(gameStore.memoLines).
 */

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export function MemoPanel({ onSendLine }: { onSendLine: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const memoLines = useGameStore((s) => s.memoLines);
  const addMemoLine = useGameStore((s) => s.addMemoLine);
  const removeMemoLine = useGameStore((s) => s.removeMemoLine);
  const updateMemoLine = useGameStore((s) => s.updateMemoLine);

  function submitDraft(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!draft.trim()) return;
    addMemoLine(draft);
    setDraft('');
  }

  function startEdit(index: number, currentText: string) {
    setEditingIndex(index);
    setEditDraft(currentText);
  }

  function saveEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (editingIndex === null || !editDraft.trim()) return;
    updateMemoLine(editingIndex, editDraft);
    setEditingIndex(null);
    setEditDraft('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="메모장"
        aria-expanded={open}
        className="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
      >
        📝 메모
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="메모장"
          className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/40 md:items-center md:justify-center md:bg-black/60 md:p-4"
        >
          <div className="flex h-full w-full max-w-xs flex-col gap-3 border-l border-slate-600 bg-slate-900 p-4 md:h-auto md:max-h-[80vh] md:rounded-2xl md:border">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-amber-300">메모장</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="메모장 닫기"
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                닫기
              </button>
            </div>

            <form onSubmit={submitDraft} className="flex gap-1.5">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="메모를 입력하세요…"
                aria-label="메모 입력"
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                추가
              </button>
            </form>

            <ul className="flex-1 space-y-1.5 overflow-y-auto">
              {memoLines.length === 0 && (
                <li className="text-center text-xs text-slate-500">아직 메모가 없어요.</li>
              )}
              {memoLines.map((line, i) =>
                editingIndex === i ? (
                  <li key={i} className="rounded-lg border border-amber-600/60 bg-slate-800/60 px-2.5 py-1.5">
                    <form onSubmit={saveEdit} className="flex gap-1.5">
                      <input
                        type="text"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        aria-label={`"${line}" 메모 수정`}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                      />
                      <button
                        type="submit"
                        disabled={!editDraft.trim()}
                        className="shrink-0 rounded bg-amber-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="shrink-0 rounded px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200"
                      >
                        취소
                      </button>
                    </form>
                  </li>
                ) : (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-100">{line}</span>
                    <button
                      type="button"
                      onClick={() => onSendLine(line)}
                      aria-label={`"${line}" 채팅으로 보내기`}
                      title="채팅으로 보내기"
                      className="shrink-0 rounded bg-sky-700/80 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-sky-600"
                    >
                      보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(i, line)}
                      aria-label={`"${line}" 메모 수정하기`}
                      title="수정"
                      className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-slate-600"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMemoLine(i)}
                      aria-label={`"${line}" 메모 삭제`}
                      title="삭제"
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
