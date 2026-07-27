/**
 * 플레이어 목록 패널 — requirements 6번: "우측, 화면 1/6 크기, 프로필 + 배정 번호 표시".
 * 프로필은 계정 프로필 사진(Avatar) 사용, 미설정/게스트는 기본 아바타 (11번 게임 내 연동).
 * 본인을 제외한 각 프로필 사진 옆에는 내가 추측한 직업을 이모지로 메모할 수 있다(SuspicionMark).
 *
 * 세로 모드 모바일에서는 채팅창이 너무 좁아지는 걸 막기 위해 2열 그리드로 압축 표시하고
 * (7~9명이 2×4~2×5면 한 화면에 다 들어온다), 가로 모드·데스크톱에서는 기존처럼 세로 목록으로
 * 보여준다. 닉네임은 좁은 칸에서 줄바꿈되지 않도록 4글자로 축약한다(truncateName).
 * 조언자로 선출된 생존자는 프로필 왼쪽에 주황색 지팡이(🪄) 표시 — 죽으면 사라진다.
 * 본인이 악 진영이면 같은 팀원의 닉네임이 빨갛게 표시되어 서로 알아볼 수 있다(3번 피드백).
 */

import type { PublicPlayerState } from '@korean-tales/shared';
import { truncateName } from '../lib/format';
import { Avatar } from './Avatar';
import { SuspicionMark } from './SuspicionMark';

export function PlayerListPanel({
  players,
  myId,
  advisorId,
  teammateIds,
}: {
  players: PublicPlayerState[];
  myId?: string;
  advisorId?: string | null;
  /** 악 진영 본인에게만 채워지는 팀원 id 목록(game:role.teammateIds) */
  teammateIds?: string[];
}) {
  return (
    <aside
      aria-label="플레이어 목록"
      className="grid w-full shrink-0 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 landscape:flex landscape:w-48 landscape:min-w-40 landscape:flex-col md:flex md:w-[16.7vw] md:min-w-40 md:flex-col"
    >
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 ${p.alive ? '' : 'opacity-45'}`}
        >
          {p.alive && p.id === advisorId && (
            <span aria-label="조언자" title="조언자" className="shrink-0 text-amber-400">
              🪄
            </span>
          )}
          <div className="relative shrink-0">
            <Avatar name={p.name} url={p.avatarUrl} size={30} />
            {p.id !== myId && <SuspicionMark playerId={p.id} />}
          </div>
          <span
            className={`min-w-0 truncate text-sm ${
              teammateIds?.includes(p.id) ? 'text-red-400' : 'text-slate-100'
            }`}
          >
            <b className="mr-1 text-amber-300">{p.seat}번</b>
            {truncateName(p.name)}
          </span>
          {!p.alive && <span className="ml-auto shrink-0 text-[10px] text-slate-400">사망</span>}
        </div>
      ))}
    </aside>
  );
}
