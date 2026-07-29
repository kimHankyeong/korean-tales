/**
 * 낮 처형 투표(재투표 포함) 종료 직후 3초간 표시되는 투표 내역 — 누가 누구에게
 * 투표했는지 대상별로 묶어 화살표(←)로 보여준다(9번 피드백). 표시 시간은
 * voteResult.durationMs를 따르며, AnnouncementToast와 같은 방식으로 id가 바뀔 때마다
 * 타이머를 새로 건다.
 */

import { Fragment, useEffect } from 'react';
import type { PublicPlayerState } from '@korean-tales/shared';
import { useGameStore } from '../store/gameStore';

/** 좌석 번호(n번)만 파란색으로 강조해서 렌더링 */
function PlayerLabel({ players, id }: { players: PublicPlayerState[]; id: string }) {
  const p = players.find((pl) => pl.id === id);
  if (!p) return <>{id}</>;
  return (
    <>
      <span className="font-bold text-blue-400">{p.seat}번</span> {p.name}
    </>
  );
}

export function VoteResultOverlay() {
  const voteResult = useGameStore((s) => s.voteResult);
  const clearVoteResult = useGameStore((s) => s.clearVoteResult);
  const players = useGameStore((s) => s.players);

  useEffect(() => {
    if (!voteResult) return;
    const timer = setTimeout(() => clearVoteResult(), voteResult.durationMs);
    return () => clearTimeout(timer);
  }, [voteResult, clearVoteResult]);

  if (!voteResult) return null;

  // 대상별로 투표자를 묶는다 — 'ABSTAIN'도 하나의 그룹
  const byTarget = new Map<string, string[]>();
  for (const [voterId, targetId] of Object.entries(voteResult.votes)) {
    const list = byTarget.get(targetId) ?? [];
    list.push(voterId);
    byTarget.set(targetId, list);
  }
  const seatOf = (id: string) => players.find((p) => p.id === id)?.seat ?? Number.MAX_SAFE_INTEGER;
  const targetEntries = [...byTarget.entries()].sort(([a], [b]) => {
    if (a === 'ABSTAIN') return 1;
    if (b === 'ABSTAIN') return -1;
    return seatOf(a) - seatOf(b);
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center px-4">
      <div
        role="status"
        aria-label="투표 결과"
        className="pointer-events-none w-full max-w-md rounded-xl border border-amber-500/60 bg-slate-900/95 p-4 text-center shadow-2xl"
      >
        <p className="mb-2 text-sm font-bold text-amber-200">투표 결과</p>
        <ul className="space-y-1.5 text-left">
          {targetEntries.map(([targetId, voterIds]) => (
            <li key={targetId} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
              <span className="font-semibold text-slate-100">
                {targetId === 'ABSTAIN' ? '기권' : <PlayerLabel players={players} id={targetId} />}
              </span>
              <span className="text-amber-400">←</span>
              <span className="text-xs text-slate-300">
                {voterIds.map((id, i) => (
                  <Fragment key={id}>
                    {i > 0 && ', '}
                    <PlayerLabel players={players} id={id} />
                  </Fragment>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
