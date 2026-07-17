/**
 * 직업 설명(스킬북) 모달 — requirements 6번:
 * "직업 설명 버튼(우측 상단): 클릭 시 9개 캐릭터 스킬북 + 진영별 승리 조건 표시"
 *
 * 진영(악/선/중립) 탭 선택 → 해당 진영 캐릭터 탭 목록 → 캐릭터 선택 시
 * 좌측 3:5 비율 일러스트 + 우측 설명, 하단에 선택된 진영의 승리 조건을 표시한다.
 * 캐릭터 데이터는 shared가 단일 원본(최신 로스터 — 깡철이 포함, 수살귀 없음)이고,
 * 일러스트 사진은 characterImages 매핑을 사용한다.
 */

import { useState } from 'react';
import {
  CHARACTERS,
  FACTION_IDS,
  FACTION_META,
  type CharacterId,
  type Faction,
  type SkillUses,
} from '@korean-tales/shared';
import { CHARACTER_IMAGES } from '../lib/characterImages';
import { CloseButton } from './CloseButton';

const FACTION_TAB_STYLE: Record<Faction, string> = {
  EVIL: 'border-purple-500 text-purple-200',
  GOOD: 'border-sky-500 text-sky-200',
  NEUTRAL: 'border-amber-500 text-amber-200',
};

function charactersOf(faction: Faction) {
  return CHARACTERS.filter((c) => c.faction === faction);
}

function usesLabel(uses: SkillUses, isPassive: boolean): string {
  if (isPassive) return '패시브';
  if (uses === 'UNLIMITED') return '무제한';
  return `${uses}회`;
}

export function SkillBookModal({ onClose }: { onClose: () => void }) {
  const [faction, setFaction] = useState<Faction>(FACTION_IDS[0]);
  const [characterId, setCharacterId] = useState<CharacterId>(charactersOf(FACTION_IDS[0])[0]!.id);

  function selectFaction(next: Faction) {
    setFaction(next);
    setCharacterId(charactersOf(next)[0]!.id);
  }

  const roster = charactersOf(faction);
  const character = CHARACTERS.find((c) => c.id === characterId)!;
  const image = CHARACTER_IMAGES[character.id];
  const factionMeta = FACTION_META[faction];

  return (
    <div
      className="fixed inset-0 z-[55] overflow-y-auto bg-black/70 p-4 md:p-8"
      role="dialog"
      aria-label="직업 설명"
    >
      <div className="relative mx-auto flex max-w-3xl flex-col rounded-2xl border border-slate-600 bg-slate-900 p-4 md:p-6">
        <CloseButton onClick={onClose} />
        <h2 className="mb-3 text-center text-base font-bold text-amber-300">직업 설명</h2>

        {/* 진영 탭 */}
        <div className="flex gap-1.5" role="tablist" aria-label="진영 선택">
          {FACTION_IDS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={faction === f}
              onClick={() => selectFaction(f)}
              className={`rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-semibold ${
                faction === f ? FACTION_TAB_STYLE[f] : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {FACTION_META[f].label}
            </button>
          ))}
        </div>

        {/* 캐릭터 탭 (선택된 진영 소속만) */}
        <div
          className="mb-3 flex flex-wrap gap-1.5 border-b border-slate-700 pb-3"
          role="tablist"
          aria-label="캐릭터 선택"
        >
          {roster.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={characterId === c.id}
              onClick={() => setCharacterId(c.id)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                characterId === c.id
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 상세: 좌측 3:5 비율 일러스트, 우측 설명 */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-40">
            <div className="aspect-[3/5] w-full overflow-hidden rounded-xl bg-slate-800">
              {image ? (
                <img
                  src={image}
                  alt={`${character.name} 일러스트`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-3xl font-bold text-slate-500">
                  {character.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="rounded-lg bg-slate-800 px-2 py-1 text-center text-sm font-bold text-amber-200">
              {character.name}
            </p>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs leading-relaxed text-slate-400">{character.lore}</p>
            {character.skills.length > 0 ? (
              <ul className="space-y-1.5" aria-label="스킬 목록">
                {character.skills.map((skill) => (
                  <li key={skill.id} className="rounded-lg bg-slate-800/70 px-2.5 py-2">
                    <p className="text-xs font-semibold text-amber-200">
                      {skill.name}
                      <span className="ml-1.5 font-normal text-slate-400">
                        {usesLabel(skill.uses, skill.isPassive)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-300">{skill.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">스킬 없음</p>
            )}
          </div>
        </div>

        {/* 선택된 진영의 승리 조건 (8번 섹션) */}
        {factionMeta.winCondition && (
          <p className="mt-4 rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-300" aria-label="승리 조건">
            <span className="mr-1.5 font-semibold text-amber-200">{factionMeta.label} 승리 조건</span>
            {factionMeta.winCondition}
          </p>
        )}
      </div>
    </div>
  );
}
