import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { CHARACTERS } from '@korean-tales/shared';
import { gameMachine } from './machine';
import { buildGameResult, phasePath, toPublicGameState } from './publicState';
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
      toPublicGameState(snapshot(), {
        p1: { name: '갑', avatarUrl: null },
        p2: { name: '을', avatarUrl: null },
      }),
    );
    expect(serialized).not.toContain('characterId');
    expect(serialized).not.toContain('faction');
    expect(serialized).not.toContain('jeoseung');
    expect(serialized).not.toContain('EVIL');
    expect(serialized).not.toContain('lastInvestigation');
    expect(serialized).not.toContain('nightKill');
    expect(serialized).not.toContain('evilVotes');
  });

  it('공개 상태에는 페이즈·생존 여부·이름·아바타가 포함된다', () => {
    const { snapshot } = startSnapshot();
    const state = toPublicGameState(snapshot(), {
      p1: { name: '갑', avatarUrl: '/uploads/avatars/u1.webp' },
    });
    expect(state.phase).toBe('firstMorning.candidacy');
    expect(state.players[0]).toEqual({
      id: 'p1',
      name: '갑',
      seat: 1,
      alive: true,
      avatarUrl: '/uploads/avatars/u1.webp',
    });
    expect(state.winner).toBeNull();
  });

  it('승패 귀속: 승리 진영 소속은 사망해도 승자, 중립은 생존 시에만 승리 팀 합류', () => {
    // 선 승리 — 악 전멸, 선 일부 사망, 중립(바리공주 p9) 생존
    const players = makePlayers().map((p) => {
      if (p.faction === 'EVIL') return { ...p, alive: false };
      if (p.id === 'p5') return { ...p, alive: false }; // 사망한 선 진영
      return p;
    });
    const result = buildGameResult(players, 'GOOD');
    const byId = Object.fromEntries(result.roles.map((r) => [r.playerId, r]));
    expect(byId.p5!.isWinner).toBe(true); // 사망한 선 진영도 승자
    expect(byId.p1!.isWinner).toBe(false); // 악 진영 패배
    expect(byId.p9!.isWinner).toBe(true); // 생존 중립 → 승리 팀 합류 (8번 섹션 확정)
  });

  it('사망한 중립은 승리 팀에 합류하지 않는다 (⚠️ 문서 미확정 — 가정)', () => {
    const players = makePlayers().map((p) =>
      p.faction === 'EVIL' || p.faction === 'NEUTRAL' ? { ...p, alive: false } : p,
    );
    const result = buildGameResult(players, 'GOOD');
    expect(result.roles.find((r) => r.playerId === 'p9')!.isWinner).toBe(false);
  });

  it('악 승리 시에도 생존 중립은 승리 팀에 합류한다 (⚠️ 문서 미확정 — 동일 규칙 가정)', () => {
    const players = makePlayers().map((p) => (p.faction === 'GOOD' ? { ...p, alive: false } : p));
    const result = buildGameResult(players, 'EVIL');
    const byId = Object.fromEntries(result.roles.map((r) => [r.playerId, r]));
    expect(byId.p1!.isWinner).toBe(true); // 악 승자
    expect(byId.p9!.isWinner).toBe(true); // 생존 중립 합류
    expect(byId.p4!.isWinner).toBe(false); // 선 패배
  });

  it('역할 전체 공개는 buildGameResult(게임 종료 전용)에서만 만들어진다', () => {
    const { roles } = buildGameResult(makePlayers(), 'GOOD');
    expect(roles).toHaveLength(9);
    expect(roles[0]).toEqual({
      playerId: 'p1',
      characterId: 'jeoseung',
      faction: 'EVIL',
      alive: true,
      isWinner: false,
    });
  });
});
