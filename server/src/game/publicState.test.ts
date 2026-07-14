import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { CHARACTERS } from '@korean-tales/shared';
import { gameMachine } from './machine';
import { buildRoleReveal, phasePath, toPublicGameState } from './publicState';
import type { GamePlayer } from './types';

function makePlayers(): GamePlayer[] {
  return CHARACTERS.map((c, i) => ({
    id: `p${i + 1}`,
    seat: i + 1,
    characterId: c.id,
    faction: c.faction,
    alive: true,
    skillUses: {},
  }));
}

function startSnapshot() {
  const actor = createActor(gameMachine, { input: { players: makePlayers(), rng: () => 0 } });
  actor.start();
  return { actor, snapshot: () => actor.getSnapshot() };
}

describe('공개 게임 상태 (정보 은닉의 단일 관문)', () => {
  it('상태 경로를 "day.vote" 형태로 평탄화한다', () => {
    expect(phasePath('gameOver')).toBe('gameOver');
    expect(phasePath({ day: 'vote' })).toBe('day.vote');
    expect(phasePath({ resolveDeaths: 'awaitGrudge' })).toBe('resolveDeaths.awaitGrudge');
  });

  it('공개 상태에는 캐릭터·진영·밤 행동 정보가 절대 포함되지 않는다', () => {
    const { actor, snapshot } = startSnapshot();
    // 밤까지 진행하면서 비밀 정보가 컨텍스트에 쌓인 상태를 만든다
    actor.send({ type: 'TIME_UP' }); // 선출 스킵
    while (snapshot().matches({ day: 'personalSpeech' })) actor.send({ type: 'TIME_UP' });
    actor.send({ type: 'TIME_UP' }); // → vote
    for (const id of snapshot().context.players.map((p) => p.id)) {
      actor.send({ type: 'VOTE', voterId: id, targetId: 'ABSTAIN' });
    }
    actor.send({ type: 'TIME_UP' }); // → night
    actor.send({ type: 'HAETAE_INVESTIGATE', targetId: 'p2' }); // 비밀 조사 결과 기록
    actor.send({ type: 'TIME_UP' }); // → evilDiscussion
    actor.send({ type: 'TIME_UP' }); // → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' }); // 비밀 악 투표

    const serialized = JSON.stringify(
      toPublicGameState(snapshot(), { p1: '갑', p2: '을' }),
    );
    expect(serialized).not.toContain('characterId');
    expect(serialized).not.toContain('faction');
    expect(serialized).not.toContain('jeoseung');
    expect(serialized).not.toContain('EVIL');
    expect(serialized).not.toContain('lastInvestigation');
    expect(serialized).not.toContain('nightKill');
    expect(serialized).not.toContain('evilVotes');
  });

  it('공개 상태에는 페이즈·생존 여부·이름이 포함된다', () => {
    const { snapshot } = startSnapshot();
    const state = toPublicGameState(snapshot(), { p1: '갑' });
    expect(state.phase).toBe('firstMorning.candidacy');
    expect(state.players[0]).toEqual({ id: 'p1', name: '갑', seat: 1, alive: true });
    expect(state.winner).toBeNull();
  });

  it('역할 전체 공개는 buildRoleReveal(게임 종료 전용)에서만 만들어진다', () => {
    const roles = buildRoleReveal(makePlayers());
    expect(roles).toHaveLength(9);
    expect(roles[0]).toEqual({ playerId: 'p1', characterId: 'jeoseung', faction: 'EVIL' });
  });
});
