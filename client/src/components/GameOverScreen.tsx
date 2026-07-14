/**
 * 게임 종료 화면 — 승리 진영 배너 + 전체 플레이어 캐릭터 공개 + 다시하기/로비로 버튼.
 * 역할 공개는 게임 종료 시에만 서버가 보내는 GameOverPayload(game:over) 기반이다.
 * 중립 승패 귀속(생존 시 승리 팀 합류)은 서버 buildGameResult가 판정해 isWinner로 내려온다.
 */

import { motion } from 'framer-motion';
import {
  CHARACTER_BY_ID,
  FACTION_META,
  type GameOverPayload,
  type PublicPlayerState,
} from '@korean-tales/shared';

export interface GameOverScreenProps {
  result: GameOverPayload;
  /** 이름·번호 표시용 (공개 상태의 플레이어 목록) */
  players: PublicPlayerState[];
  onRestart: () => void;
  onGoLobby: () => void;
}

const FACTION_STYLE = {
  EVIL: 'text-purple-300 border-purple-500/40 bg-purple-950/40',
  GOOD: 'text-sky-300 border-sky-500/40 bg-sky-950/40',
  NEUTRAL: 'text-amber-300 border-amber-500/40 bg-amber-950/40',
} as const;

export function GameOverScreen({ result, players, onRestart, onGoLobby }: GameOverScreenProps) {
  const nameOf = (id: string) => players.find((p) => p.id === id);
  const winnerMeta = FACTION_META[result.winner];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-slate-950/95 p-6">
      {/* 승리 진영 배너 */}
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className={`text-3xl font-black ${result.winner === 'EVIL' ? 'text-purple-300' : 'text-sky-300'}`}
      >
        {winnerMeta.label} 승리!
      </motion.h1>

      {/* 전체 캐릭터 공개 */}
      <ul className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3" aria-label="역할 공개">
        {result.roles.map((role, i) => {
          const player = nameOf(role.playerId);
          const character = CHARACTER_BY_ID[role.characterId];
          return (
            <motion.li
              key={role.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              className={`rounded-xl border px-3 py-2 ${FACTION_STYLE[role.faction]} ${
                role.alive ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-100">
                  {player ? `${player.seat}번 ${player.name}` : role.playerId}
                </span>
                {role.isWinner && (
                  <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                    승리
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs">
                <span className="font-bold">{character.name}</span>
                <span>
                  {FACTION_META[role.faction].label}
                  {!role.alive && ' · 사망'}
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* 다시하기 / 로비로 */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-bold text-white hover:bg-amber-500"
        >
          다시하기
        </button>
        <button
          type="button"
          onClick={onGoLobby}
          className="rounded-lg border border-slate-500 px-6 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          로비로
        </button>
      </div>
    </div>
  );
}
