import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { CHARACTERS } from '@korean-tales/shared';
import { isActionAllowed } from './actionAuth';
import { gameMachine } from './machine';
import type { GamePlayer } from './types';

// p1 저승사자, p2 깡철이, p3 구미호, p4 자청비, p5 해태, p6 도깨비, p7 장화홍련, p8 까치선비, p9 바리공주
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

function snapshotOf() {
  const actor = createActor(gameMachine, { input: { players: makePlayers(), rng: () => 0 } });
  actor.start();
  return { actor, snapshot: () => actor.getSnapshot() };
}

describe('클라이언트 액션 권한 검증 (정보 은닉·부정 방지)', () => {
  it('남의 이름으로 투표/스킵할 수 없다', () => {
    const { snapshot } = snapshotOf();
    expect(isActionAllowed('p1', { type: 'VOTE', voterId: 'p2', targetId: 'p3' }, snapshot())).toBe(false);
    expect(isActionAllowed('p1', { type: 'VOTE', voterId: 'p1', targetId: 'p3' }, snapshot())).toBe(true);
    expect(isActionAllowed('p1', { type: 'SKIP', playerId: 'p2' }, snapshot())).toBe(false);
    expect(isActionAllowed('p1', { type: 'CANDIDACY_APPLY', playerId: 'p2' }, snapshot())).toBe(false);
  });

  it('캐릭터 전용 스킬은 해당 캐릭터 본인만 쓸 수 있다', () => {
    const { snapshot } = snapshotOf();
    expect(isActionAllowed('p5', { type: 'HAETAE_INVESTIGATE', targetId: 'p1' }, snapshot())).toBe(true);
    expect(isActionAllowed('p1', { type: 'HAETAE_INVESTIGATE', targetId: 'p5' }, snapshot())).toBe(false);
    expect(isActionAllowed('p4', { type: 'FLOWER_DOOM', targetId: 'p1' }, snapshot())).toBe(true);
    expect(isActionAllowed('p6', { type: 'FLOWER_DOOM', targetId: 'p1' }, snapshot())).toBe(false);
    expect(isActionAllowed('p6', { type: 'DOKKAEBI_PRANK' }, snapshot())).toBe(true);
    expect(isActionAllowed('p3', { type: 'GUMIHO_SEDUCE' }, snapshot())).toBe(true);
    expect(isActionAllowed('p1', { type: 'JEOSEUNG_COMPANION', targetId: 'p5' }, snapshot())).toBe(true);
    expect(isActionAllowed('p2', { type: 'JEOSEUNG_COMPANION', targetId: 'p5' }, snapshot())).toBe(false);
  });

  it('악 처치 투표는 악 진영 본인 명의만 가능하다', () => {
    const { snapshot } = snapshotOf();
    expect(isActionAllowed('p1', { type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' }, snapshot())).toBe(true);
    expect(isActionAllowed('p5', { type: 'EVIL_KILL_VOTE', voterId: 'p5', targetId: 'p1' }, snapshot())).toBe(false); // 선 진영
    expect(isActionAllowed('p1', { type: 'EVIL_KILL_VOTE', voterId: 'p2', targetId: 'p5' }, snapshot())).toBe(false); // 명의 도용
  });

  it('조언자 방향 결정은 조언자만 가능하다', () => {
    const { actor, snapshot } = snapshotOf();
    expect(isActionAllowed('p1', { type: 'ADVISOR_DIRECTION', direction: 'REVERSE' }, snapshot())).toBe(false);
    // p5를 조언자로 선출
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p5' });
    actor.send({ type: 'TIME_UP' }); // → 어필
    actor.send({ type: 'TIME_UP' }); // → 토론
    actor.send({ type: 'TIME_UP' }); // → 투표
    actor.send({ type: 'VOTE', voterId: 'p1', targetId: 'p5' });
    actor.send({ type: 'TIME_UP' });
    expect(snapshot().context.advisorId).toBe('p5');
    expect(isActionAllowed('p5', { type: 'ADVISOR_DIRECTION', direction: 'REVERSE' }, snapshot())).toBe(true);
    expect(isActionAllowed('p1', { type: 'ADVISOR_DIRECTION', direction: 'REVERSE' }, snapshot())).toBe(false);
  });

  it('사망 트리거 응답은 대기 중인 당사자만 가능하다', () => {
    const { actor, snapshot } = snapshotOf();
    // 대기 없음 — 거부
    expect(isActionAllowed('p7', { type: 'GRUDGE_TARGET', targetId: 'p1' }, snapshot())).toBe(false);
    // 장화홍련(p7) 처형 → 유서 대기
    actor.send({ type: 'TIME_UP' }); // 선출 스킵
    while (snapshot().matches({ day: 'personalSpeech' })) actor.send({ type: 'TIME_UP' });
    actor.send({ type: 'TIME_UP' }); // 토론 → 투표
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9']) {
      actor.send({ type: 'VOTE', voterId: id, targetId: 'p7' });
    }
    actor.send({ type: 'TIME_UP' }); // → 변론
    actor.send({ type: 'TIME_UP' }); // → 처형 → 유서 대기
    expect(snapshot().context.awaiting).toEqual({ kind: 'GRUDGE', playerId: 'p7' });
    expect(isActionAllowed('p7', { type: 'GRUDGE_TARGET', targetId: 'p1' }, snapshot())).toBe(true);
    expect(isActionAllowed('p1', { type: 'GRUDGE_TARGET', targetId: 'p5' }, snapshot())).toBe(false);
    expect(isActionAllowed('p1', { type: 'GRUDGE_FORGO' }, snapshot())).toBe(false);
  });

  it('방에 없는 발신자·알 수 없는 액션은 거부된다', () => {
    const { snapshot } = snapshotOf();
    expect(isActionAllowed('ghost', { type: 'VOTE', voterId: 'ghost', targetId: 'p1' }, snapshot())).toBe(false);
    // 서버 전용 이벤트는 타입에서 제외되지만 런타임 방어도 확인
    expect(
      isActionAllowed('p1', { type: 'TIME_UP' } as never, snapshot()),
    ).toBe(false);
  });
});
