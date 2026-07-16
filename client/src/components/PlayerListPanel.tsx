/**
 * 플레이어 목록 패널 — requirements 6번: "우측, 화면 1/6 크기, 프로필 + 배정 번호 표시".
 * 프로필은 계정 프로필 사진(Avatar) 사용, 미설정/게스트는 기본 아바타 (11번 게임 내 연동).
 */

import type { PublicPlayerState } from '@korean-tales/shared';
import { Avatar } from './Avatar';

export function PlayerListPanel({ players }: { players: PublicPlayerState[] }) {
  return (
    <aside
      aria-label="플레이어 목록"
      className="flex w-full shrink-0 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 md:w-[16.7vw] md:min-w-40"
    >
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-2 rounded-lg px-2 py-1 ${p.alive ? '' : 'opacity-45'}`}
        >
          <Avatar name={p.name} url={p.avatarUrl} size={30} />
          <span className="truncate text-sm text-slate-100">
            <b className="mr-1 text-amber-300">{p.seat}번</b>
            {p.name}
          </span>
          {!p.alive && <span className="ml-auto text-[10px] text-slate-400">사망</span>}
        </div>
      ))}
    </aside>
  );
}
