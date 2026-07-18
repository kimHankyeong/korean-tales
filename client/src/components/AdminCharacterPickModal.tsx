/**
 * 관리자 전용 — 정원 미달로 혼자 테스트할 때 직업을 직접 골라 배정받는 모달 (13번).
 * 현재 방 모드(7인/9인)의 로스터만 표시하며, "무작위 배정"으로 기존 랜덤 배정도 유지한다.
 */

import { CHARACTER_BY_ID, FACTION_META, ROSTER_BY_MODE, type CharacterId, type PlayerMode } from '@korean-tales/shared';
import { CloseButton } from './CloseButton';

export function AdminCharacterPickModal({
  mode,
  onPick,
  onClose,
}: {
  mode: PlayerMode;
  onPick: (characterId: CharacterId | null) => void;
  onClose: () => void;
}) {
  const roster = ROSTER_BY_MODE[mode];

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-label="관리자 직업 선택"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-4">
        <CloseButton onClick={onClose} />
        <h2 className="mb-3 text-center text-sm font-bold text-amber-300">테스트로 플레이할 직업 선택</h2>
        <div className="grid grid-cols-2 gap-2">
          {roster.map((id) => {
            const character = CHARACTER_BY_ID[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-left hover:bg-slate-700"
              >
                <span className="block text-sm font-semibold text-slate-100">{character.name}</span>
                <span className="text-[11px] text-slate-400">{FACTION_META[character.faction].label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="mt-3 w-full rounded-lg border border-slate-500 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          무작위 배정
        </button>
      </div>
    </div>
  );
}
