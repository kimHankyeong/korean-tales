import { describe, expect, it } from 'vitest';
import type { GameRolePayload, PublicGameState, PublicPlayerState } from '@korean-tales/shared';
import { resolveActivePrompt } from './gamePrompts';

function makePlayers(overrides: Partial<Record<string, boolean>> = {}): PublicPlayerState[] {
  return ['p1', 'p2', 'p3'].map((id, i) => ({
    id,
    name: `유저${i + 1}`,
    seat: i + 1,
    alive: overrides[id] ?? true,
    avatarUrl: null,
  }));
}

function baseState(overrides: Partial<PublicGameState> = {}): PublicGameState {
  return {
    phase: 'day.vote',
    day: 1,
    players: makePlayers(),
    advisorId: null,
    speechDirection: 'FORWARD',
    currentSpeakerId: null,
    candidates: [],
    tieCandidates: [],
    executionTargetId: null,
    awaiting: null,
    winner: null,
    ...overrides,
  };
}

const haetaeRole: GameRolePayload = {
  characterId: 'haetae',
  faction: 'GOOD',
  seat: 1,
  teammateIds: [],
  mySkillUses: {},
};

describe('resolveActivePrompt — 사망자는 관전만 가능 (13번 버그 수정)', () => {
  it('생존자는 낮 투표 프롬프트를 받는다', () => {
    const state = baseState({ players: makePlayers({ p1: true }) });
    expect(resolveActivePrompt(state, null, 'p1')?.kind).toBe('SELECT');
  });

  it('사망자는 낮 투표 프롬프트를 받지 못한다', () => {
    const state = baseState({ players: makePlayers({ p1: false }) });
    expect(resolveActivePrompt(state, null, 'p1')).toBeNull();
  });

  it('사망자는 밤 스킬(해태 투사) 프롬프트도 받지 못한다', () => {
    const state = baseState({ phase: 'night.goodSkills', players: makePlayers({ p1: false }) });
    expect(resolveActivePrompt(state, haetaeRole, 'p1')).toBeNull();
  });

  it('본인의 사망 확정 트리거 응답(GRUDGE)은 이미 사망 처리된 상태여도 정상 표시된다', () => {
    const state = baseState({
      phase: 'resolveDeaths.awaitGrudge',
      players: makePlayers({ p1: false }), // 방금 죽어서 alive:false
      awaiting: { kind: 'GRUDGE', playerId: 'p1' },
    });
    expect(resolveActivePrompt(state, null, 'p1')?.kind).toBe('SELECT');
  });
});
