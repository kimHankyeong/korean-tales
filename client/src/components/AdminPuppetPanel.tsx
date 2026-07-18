/**
 * 관리자 전용 — 가상 플레이어 조작 패널 (13번). 관리자가 정원을 가상 플레이어로 채워
 * 혼자 테스트할 때, 각 가상 플레이어의 입장에서 투표·발언 스킵·스킬 사용을 대신
 * 지정한다. resolveActivePrompt를 "나" 대신 선택한 가상 플레이어 기준으로 호출해
 * 실제 게임 화면과 동일한 판단 로직을 재사용한다 — 최종 유효성은 서버가 다시 검증한다.
 */

import { useEffect, useState } from 'react';
import type {
  AdminRosterPayload,
  ClientGameAction,
  FlowerOptionsPayload,
  PublicGameState,
} from '@korean-tales/shared';
import { resolveActivePrompt } from '../lib/gamePrompts';
import { Avatar } from './Avatar';

type RosterEntry = AdminRosterPayload['players'][number];

export interface AdminPuppetPanelProps {
  roster: AdminRosterPayload['players'];
  publicState: PublicGameState | null;
  timerPhaseKey: string | null;
  flowerOptions: FlowerOptionsPayload | null;
  onSubmit: (playerId: string, action: ClientGameAction) => void;
}

function TargetGrid({
  candidates,
  selected,
  onSelect,
  allowAbstain,
}: {
  candidates: RosterEntry[];
  selected: string | 'ABSTAIN' | null;
  onSelect: (target: string | 'ABSTAIN') => void;
  allowAbstain?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="listbox" aria-label="대상 선택">
      {candidates.map((c) => (
        <button
          key={c.playerId}
          type="button"
          role="option"
          aria-selected={selected === c.playerId}
          onClick={() => onSelect(c.playerId)}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
            selected === c.playerId ? 'bg-amber-600/40 ring-1 ring-amber-400' : 'bg-slate-800 hover:bg-slate-700'
          }`}
        >
          <Avatar name={c.name} url={null} size={18} />
          {c.seat}번 {c.isVirtual ? c.name : ''}
        </button>
      ))}
      {allowAbstain && (
        <button
          type="button"
          role="option"
          aria-selected={selected === 'ABSTAIN'}
          onClick={() => onSelect('ABSTAIN')}
          className={`rounded-lg border border-dashed px-2 py-1 text-xs ${
            selected === 'ABSTAIN' ? 'border-amber-400 text-amber-200' : 'border-slate-600 text-slate-400'
          }`}
        >
          기권
        </button>
      )}
    </div>
  );
}

export function AdminPuppetPanel({ roster, publicState, timerPhaseKey, flowerOptions, onSubmit }: AdminPuppetPanelProps) {
  const virtualPlayers = roster.filter((p) => p.isVirtual);
  const [actingAs, setActingAs] = useState<string | null>(null);
  const [target, setTarget] = useState<string | 'ABSTAIN' | null>(null);
  const [flowerMode, setFlowerMode] = useState<'REVIVE' | 'DOOM' | null>(null);

  const active = actingAs ? virtualPlayers.find((p) => p.playerId === actingAs) ?? null : null;

  const prompt =
    active && publicState
      ? resolveActivePrompt(
          publicState,
          { characterId: active.characterId, faction: active.faction, seat: active.seat },
          active.playerId,
          timerPhaseKey,
        )
      : null;

  // 대상(가상 플레이어) 또는 프롬프트 종류가 바뀌면 이전 선택을 지운다
  useEffect(() => {
    setTarget(null);
    setFlowerMode(null);
  }, [actingAs, prompt?.kind]);

  if (virtualPlayers.length === 0) return null;

  function submit(action: ClientGameAction) {
    if (!active) return;
    onSubmit(active.playerId, action);
    setTarget(null);
    setFlowerMode(null);
  }

  return (
    <aside
      aria-label="관리자 — 가상 플레이어 조작"
      className="flex w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-amber-700/60 bg-slate-900 p-3 landscape:w-56 md:w-72"
    >
      <p className="text-xs font-bold text-amber-300">🎮 가상 플레이어 조작 (관리자)</p>

      <div className="flex flex-wrap gap-1">
        {virtualPlayers.map((p) => (
          <button
            key={p.playerId}
            type="button"
            disabled={!p.alive}
            onClick={() => setActingAs(p.playerId)}
            className={`rounded-lg px-2 py-1 text-xs disabled:opacity-30 ${
              actingAs === p.playerId ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {p.seat}번 {p.name}
            {!p.alive && ' (사망)'}
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-2">
          <p className="mb-1.5 text-[11px] text-slate-400">
            {active.seat}번 {active.name} — 지금 이 플레이어가 할 수 있는 행동
          </p>

          {!prompt && <p className="text-xs text-slate-500">지금은 대신 할 행동이 없어요.</p>}

          {prompt?.kind === 'SKIP' && (
            <button
              type="button"
              onClick={() => submit({ type: 'SKIP', playerId: active.playerId })}
              className="rounded-lg border border-slate-500 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              Skip
            </button>
          )}

          {prompt?.kind === 'BUTTON' && (
            <button
              type="button"
              onClick={() => submit(prompt.action)}
              className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white"
            >
              {prompt.label}
            </button>
          )}

          {prompt?.kind === 'SELECT' && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-200">{prompt.title}</p>
              <TargetGrid
                candidates={roster.filter(
                  (p) =>
                    p.alive &&
                    (!prompt.excludeSelf || p.playerId !== active.playerId) &&
                    (!prompt.candidateIds || prompt.candidateIds.includes(p.playerId)),
                )}
                selected={target}
                onSelect={setTarget}
                allowAbstain={prompt.allowAbstain}
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={target === null}
                  onClick={() => target !== null && submit(prompt.buildAction(target))}
                  className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                >
                  {prompt.buttonLabel}
                </button>
                {prompt.allowForgo && prompt.forgoAction && (
                  <button
                    type="button"
                    onClick={() => submit(prompt.forgoAction!)}
                    className="rounded-lg border border-slate-500 px-3 py-1 text-xs text-slate-300"
                  >
                    스킬 포기
                  </button>
                )}
              </div>
            </div>
          )}

          {prompt?.kind === 'FLOWER' && (
            <div className="space-y-1.5">
              {flowerMode === null ? (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={!flowerOptions?.revivableTargetIds.length}
                    onClick={() => setFlowerMode('REVIVE')}
                    className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                  >
                    부활꽃
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlowerMode('DOOM')}
                    className="rounded-lg border border-red-600 px-3 py-1 text-xs font-bold text-red-300"
                  >
                    멸망꽃
                  </button>
                  <button
                    type="button"
                    onClick={() => submit({ type: 'FLOWER_PASS' })}
                    className="rounded-lg border border-slate-500 px-3 py-1 text-xs text-slate-300"
                  >
                    패스
                  </button>
                </div>
              ) : (
                <>
                  <TargetGrid
                    candidates={
                      flowerMode === 'REVIVE'
                        ? roster.filter((p) => flowerOptions?.revivableTargetIds.includes(p.playerId))
                        : roster.filter((p) => p.alive)
                    }
                    selected={target}
                    onSelect={setTarget}
                  />
                  <button
                    type="button"
                    disabled={target === null || target === 'ABSTAIN'}
                    onClick={() =>
                      target &&
                      target !== 'ABSTAIN' &&
                      submit(
                        flowerMode === 'REVIVE'
                          ? { type: 'FLOWER_REVIVE', targetId: target }
                          : { type: 'FLOWER_DOOM', targetId: target },
                      )
                    }
                    className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                  >
                    선택하기
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
