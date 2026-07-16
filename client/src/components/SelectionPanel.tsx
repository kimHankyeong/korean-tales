/**
 * 투표/스킬 선택 공용 컴포넌트 — 6번 섹션:
 * - 화면 중앙, 화면 1/6 크기, 생존 플레이어 번호+프로필 가로 나열
 * - 프로필 클릭 → 하단 버튼 활성화
 * - 버튼 텍스트만 "투표하기"/"선택하기"로 분기 (props)
 * - 기권 옵션 on/off (투표 창), "스킬 포기" 버튼 on/off (장화홍련 등)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar } from './Avatar';

export interface SelectablePlayer {
  id: string;
  seat: number;
  name: string;
  alive: boolean;
  /** 계정 프로필 사진 — 없으면 기본 아바타 (requirements 11번 게임 내 연동) */
  avatarUrl?: string | null;
}

export type SelectionTarget = string | 'ABSTAIN';

export interface SelectionPanelProps {
  /** 패널 상단 제목 (예: "처형 투표", "투사 — 조사 대상 선택") */
  title: string;
  players: SelectablePlayer[];
  /** 버튼 텍스트 분기: 투표 창 "투표하기" / 스킬 창 "선택하기" */
  buttonLabel: '투표하기' | '선택하기';
  /** 기권 옵션 (처형 투표) */
  allowAbstain?: boolean;
  /** "스킬 포기" 버튼 (장화홍련 피 맺힌 유서 등) */
  allowForgo?: boolean;
  /** 선택 불가 대상 (예: 본인 제외 스킬) */
  disabledIds?: string[];
  onConfirm: (target: SelectionTarget) => void;
  onForgo?: () => void;
}

export function SelectionPanel({
  title,
  players,
  buttonLabel,
  allowAbstain = false,
  allowForgo = false,
  disabledIds = [],
  onConfirm,
  onForgo,
}: SelectionPanelProps) {
  const [selected, setSelected] = useState<SelectionTarget | null>(null);
  const alivePlayers = players.filter((p) => p.alive);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        // 화면 1/6 크기 — 높이 기준 (6번 섹션)
        className="pointer-events-auto flex h-[16.7vh] min-h-36 w-[min(92vw,42rem)] flex-col rounded-xl border border-slate-600 bg-slate-900/95 px-4 py-2 shadow-2xl"
        aria-label={title}
      >
        <h2 className="mb-1 text-center text-xs font-bold text-amber-200">{title}</h2>

        {/* 생존 플레이어 번호+프로필 가로 나열 */}
        <div className="flex flex-1 items-center gap-2 overflow-x-auto" role="listbox" aria-label="대상 목록">
          {alivePlayers.map((p) => {
            const disabled = disabledIds.includes(p.id);
            const isSelected = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => setSelected(p.id)}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition ${
                  isSelected ? 'bg-amber-600/30 ring-2 ring-amber-400' : 'hover:bg-slate-700/60'
                } disabled:cursor-not-allowed disabled:opacity-30`}
              >
                {/* 계정 프로필 사진 — 미설정 시 기본 아바타 */}
                <Avatar name={p.name} url={p.avatarUrl} size={36} />
                <span className="text-[11px] text-slate-300">{p.seat}번</span>
              </button>
            );
          })}

          {/* 기권 옵션 (6번 섹션 — 투표 창) */}
          {allowAbstain && (
            <button
              type="button"
              role="option"
              aria-selected={selected === 'ABSTAIN'}
              onClick={() => setSelected('ABSTAIN')}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition ${
                selected === 'ABSTAIN' ? 'bg-slate-500/40 ring-2 ring-slate-300' : 'hover:bg-slate-700/60'
              }`}
            >
              <span className="grid size-9 place-items-center rounded-full border border-dashed border-slate-400 text-sm text-slate-300">
                ─
              </span>
              <span className="text-[11px] text-slate-300">기권</span>
            </button>
          )}
        </div>

        {/* 하단 버튼 — 선택 전 비활성 */}
        <div className="flex items-center justify-center gap-2 pb-1">
          <button
            type="button"
            disabled={selected === null}
            onClick={() => selected !== null && onConfirm(selected)}
            className="rounded-lg bg-amber-600 px-6 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {buttonLabel}
          </button>
          {allowForgo && (
            <button
              type="button"
              onClick={() => onForgo?.()}
              className="rounded-lg border border-slate-500 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              스킬 포기
            </button>
          )}
        </div>
      </motion.section>
    </div>
  );
}
