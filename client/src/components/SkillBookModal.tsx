/**
 * 직업 설명(스킬북) 모달 — requirements 6번:
 * "직업 설명 버튼(우측 상단): 클릭 시 9개 캐릭터 스킬북 + 진영별 승리 조건 표시"
 * 캐릭터 데이터는 shared가 단일 원본(최신 로스터 — 깡철이 포함, 수살귀 없음)이고,
 * 일러스트 사진은 characterImages 매핑을 사용한다.
 */

import {
  CHARACTERS,
  FACTION_META,
  type GameCharacter,
  type SkillUses,
} from '@korean-tales/shared';
import { CHARACTER_IMAGES } from '../lib/characterImages';

const FACTION_CARD_STYLE = {
  EVIL: 'border-purple-500/40',
  GOOD: 'border-sky-500/40',
  NEUTRAL: 'border-amber-500/40',
} as const;

const FACTION_CHIP_STYLE = {
  EVIL: 'bg-purple-500/20 text-purple-200',
  GOOD: 'bg-sky-500/20 text-sky-200',
  NEUTRAL: 'bg-amber-500/20 text-amber-200',
} as const;

function usesLabel(uses: SkillUses, isPassive: boolean): string {
  if (isPassive) return '패시브';
  if (uses === 'UNLIMITED') return '무제한';
  return `${uses}회`;
}

function CharacterCard({ character }: { character: GameCharacter }) {
  const image = CHARACTER_IMAGES[character.id];
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border bg-slate-800/60 p-3 ${FACTION_CARD_STYLE[character.faction]}`}
    >
      <div className="flex items-center gap-3">
        {/* 캐릭터 일러스트 사진 — 미제작(깡철이)은 이름 이니셜로 대체 */}
        {image ? (
          <img
            src={image}
            alt={`${character.name} 일러스트`}
            className="size-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-slate-700 text-2xl font-bold text-slate-300">
            {character.name.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-100">{character.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FACTION_CHIP_STYLE[character.faction]}`}
            >
              {FACTION_META[character.faction].label}
            </span>
          </div>
          {/* 배경설화 1~2줄 (3번 섹션) */}
          <p className="mt-0.5 text-xs leading-snug text-slate-400">{character.lore}</p>
        </div>
      </div>

      {character.skills.length > 0 ? (
        <ul className="space-y-1">
          {character.skills.map((skill) => (
            <li key={skill.id} className="rounded-lg bg-slate-900/70 px-2 py-1.5">
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
    </li>
  );
}

export function SkillBookModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[55] overflow-y-auto bg-black/70 p-4 md:p-8"
      role="dialog"
      aria-label="직업 설명"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-600 bg-slate-900 p-4 md:p-6">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-amber-300">직업 설명</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-500 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            닫기
          </button>
        </header>

        {/* 9개 캐릭터 스킬북 */}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="캐릭터 목록">
          {CHARACTERS.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </ul>

        {/* 진영별 승리 조건 (8번 섹션) */}
        <section className="mt-4" aria-label="진영별 승리 조건">
          <h3 className="mb-1.5 text-sm font-bold text-slate-200">진영별 승리 조건</h3>
          <ul className="space-y-1">
            {Object.values(FACTION_META).map((faction) =>
              faction.winCondition ? (
                <li key={faction.id} className="flex gap-2 text-xs text-slate-300">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${FACTION_CHIP_STYLE[faction.id]}`}
                  >
                    {faction.label}
                  </span>
                  <span className="leading-relaxed">{faction.winCondition}</span>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
