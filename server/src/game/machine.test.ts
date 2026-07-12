import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { CHARACTERS } from '@korean-tales/shared';
import { gameMachine } from './machine';
import type { GamePlayer } from './types';

/**
 * 9인 전원 배치 — CHARACTERS 정의 순서 그대로:
 * p1 저승사자, p2 깡철이, p3 구미호 (악)
 * p4 자청비, p5 해태, p6 도깨비, p7 장화홍련, p8 까치선비 (선)
 * p9 바리공주 (중립)
 */
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

function startGame(rng: () => number = () => 0) {
  const actor = createActor(gameMachine, { input: { players: makePlayers(), rng } });
  actor.start();
  return actor;
}

type Actor = ReturnType<typeof startGame>;

const timeUp = (actor: Actor) => actor.send({ type: 'TIME_UP' });

/** 출마자 없이 선출 단계 통과 → 첫날 낮 토론 */
function skipElection(actor: Actor) {
  timeUp(actor);
}

/** voters 전원이 targetId에 투표 */
function voteAll(actor: Actor, voterIds: string[], targetId: string | 'ABSTAIN') {
  for (const voterId of voterIds) actor.send({ type: 'VOTE', voterId, targetId });
}

const aliveIds = (actor: Actor) =>
  actor.getSnapshot().context.players.filter((p) => p.alive).map((p) => p.id);

const player = (actor: Actor, id: string) =>
  actor.getSnapshot().context.players.find((p) => p.id === id)!;

/** 밤 전체를 이벤트 주입 없이 통과: 선스킬 → 악토론 → 악투표 → 악개별스킬 */
function passNight(actor: Actor) {
  timeUp(actor); // goodSkills → evilDiscussion
  timeUp(actor); // evilDiscussion → evilVote
  timeUp(actor); // evilVote → evilSkills (무투표 → 킬 없음)
  timeUp(actor); // evilSkills → dawn
}

describe('첫날 아침 — 조언자 선출 (requirements 7번)', () => {
  it('게임은 출마 신청 상태에서 시작한다', () => {
    const actor = startGame();
    expect(actor.getSnapshot().matches({ firstMorning: 'candidacy' })).toBe(true);
  });

  it('출마자가 없으면 조언자 없이 낮 토론으로 (발언 순서 정순 고정)', () => {
    const actor = startGame();
    timeUp(actor);
    const snap = actor.getSnapshot();
    expect(snap.matches({ day: 'discussion' })).toBe(true);
    expect(snap.context.advisorId).toBeNull();
    expect(snap.context.advisorBroken).toBe(true);
  });

  it('선출 풀 플로우: 출마 2인 → 어필×2 → 토론 → 투표 → 최다 득표자 확정', () => {
    const actor = startGame();
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p2' });
    timeUp(actor); // candidacy 종료 → 어필 (p1)
    expect(actor.getSnapshot().matches({ firstMorning: 'appeal' })).toBe(true);
    timeUp(actor); // p1 어필 종료 → p2
    timeUp(actor); // p2 어필 종료 → 전체 토론
    expect(actor.getSnapshot().matches({ firstMorning: 'electionDiscussion' })).toBe(true);
    timeUp(actor); // 토론 종료 → 투표
    // 출마자(p1·p2)는 투표권 없음 — 무시되어야 함
    actor.send({ type: 'VOTE', voterId: 'p1', targetId: 'p2' });
    voteAll(actor, ['p3', 'p4'], 'p1');
    voteAll(actor, ['p5'], 'p2');
    timeUp(actor);
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p1');
    expect(snap.matches({ day: 'discussion' })).toBe(true);
  });

  it('선출 동표 → 재투표 → 재동표면 무작위 선정', () => {
    const actor = startGame(() => 0); // rng 고정 → 동표 후보 중 첫 번째
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p2' });
    timeUp(actor); // → appeal p1
    timeUp(actor); // → appeal p2
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p3'], 'p1');
    voteAll(actor, ['p4'], 'p2');
    timeUp(actor); // 동표 → 재투표
    expect(actor.getSnapshot().matches({ firstMorning: 'electionRevote' })).toBe(true);
    voteAll(actor, ['p5'], 'p1');
    voteAll(actor, ['p6'], 'p2');
    timeUp(actor); // 재동표 → 무작위 (rng=0 → p1)
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p1');
    expect(snap.matches({ day: 'discussion' })).toBe(true);
  });
});

describe('낮 페이즈 (requirements 5번)', () => {
  it('전원 기권이면 희생자 없이 밤으로 전환된다', () => {
    const actor = startGame();
    skipElection(actor);
    timeUp(actor); // 토론 종료 → 투표
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor);
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
    expect(aliveIds(actor)).toHaveLength(9);
  });

  it('동표 → 동시 발언 → 재투표 → 재동표면 무작위 1인 처형', () => {
    const actor = startGame(() => 0);
    skipElection(actor);
    timeUp(actor); // → vote
    voteAll(actor, ['p1'], 'p5');
    voteAll(actor, ['p2'], 'p6');
    timeUp(actor); // 동표 → 동시 발언
    expect(actor.getSnapshot().matches({ day: 'tieSpeech' })).toBe(true);
    timeUp(actor); // → 재투표 (후보는 p5·p6로 제한)
    actor.send({ type: 'VOTE', voterId: 'p1', targetId: 'p9' }); // 후보 아님 — 무시
    voteAll(actor, ['p1'], 'p5');
    voteAll(actor, ['p2'], 'p6');
    timeUp(actor); // 재동표 → 무작위 (rng=0 → p5)
    const snap = actor.getSnapshot();
    expect(snap.matches({ day: 'finalPlea' })).toBe(true);
    expect(snap.context.executionTargetId).toBe('p5');
    timeUp(actor); // 변론 종료 → 처형 → 밤
    expect(player(actor, 'p5').alive).toBe(false);
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
  });

  it('구미호 유혹: 다음날 토론 후 투표를 통째로 스킵하고 바로 밤으로', () => {
    const actor = startGame();
    skipElection(actor);
    timeUp(actor); // → vote
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // → night
    timeUp(actor); // goodSkills → evilDiscussion
    timeUp(actor); // → evilVote
    timeUp(actor); // (킬 없음) → evilSkills
    actor.send({ type: 'GUMIHO_SEDUCE' });
    timeUp(actor); // → dawn → 꽃 선택 (멸망꽃 사용 가능하므로 표시)
    expect(actor.getSnapshot().matches({ day: 'flowerDecision' })).toBe(true);
    actor.send({ type: 'FLOWER_PASS' }); // → (사망 없음) → 낮 토론
    expect(actor.getSnapshot().matches({ day: 'discussion' })).toBe(true);
    timeUp(actor); // 토론 종료 → 유혹 발동: 투표 스킵, 바로 밤
    const snap = actor.getSnapshot();
    expect(snap.matches({ night: 'goodSkills' })).toBe(true);
    expect(snap.context.seduceNextDay).toBe(false); // 1회성 소모
  });
});

describe('밤 페이즈 (requirements 4번)', () => {
  function toNight(actor: Actor) {
    skipElection(actor);
    timeUp(actor); // → vote
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // → night
  }

  it('해태 투사: 깡철이는 "악 진영이 아닙니다"로 기록된다', () => {
    const actor = startGame();
    toNight(actor);
    actor.send({ type: 'HAETAE_INVESTIGATE', targetId: 'p2' }); // 깡철이
    expect(actor.getSnapshot().context.lastInvestigation).toEqual({
      targetId: 'p2',
      result: 'NOT_EVIL',
    });
  });

  it('악 투표로 킬 → 새벽에 사망 반영 → 부활꽃으로 부활 가능', () => {
    const actor = startGame();
    toNight(actor);
    timeUp(actor); // goodSkills → evilDiscussion
    timeUp(actor); // → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // → evilSkills
    timeUp(actor); // → dawn: p5 사망 반영
    expect(player(actor, 'p5').alive).toBe(false);
    expect(actor.getSnapshot().matches({ day: 'flowerDecision' })).toBe(true);
    actor.send({ type: 'FLOWER_REVIVE', targetId: 'p5' });
    const snap = actor.getSnapshot();
    expect(player(actor, 'p5').alive).toBe(true);
    expect(snap.matches({ day: 'discussion' })).toBe(true);
    // 부활꽃 소모 확인
    expect(player(actor, 'p4').skillUses['revival-flower']).toBe(1);
  });

  it('도깨비 장난: 밤 킬이 무산되어 아무도 죽지 않는다 (차단 사실 비공개)', () => {
    const actor = startGame();
    toNight(actor);
    actor.send({ type: 'DOKKAEBI_PRANK' });
    timeUp(actor); // → evilDiscussion
    timeUp(actor); // → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // → evilSkills
    timeUp(actor); // → dawn: 장난으로 킬 무효
    expect(player(actor, 'p5').alive).toBe(true);
    expect(actor.getSnapshot().context.pendingDeaths).toHaveLength(0);
    expect(player(actor, 'p6').skillUses.prank).toBe(1); // 1회 소모
  });
});

describe('사망 확정 트리거 (requirements 5-6항·7번)', () => {
  function executeTarget(actor: Actor, targetId: string) {
    timeUp(actor); // 토론 종료 → 투표
    voteAll(
      actor,
      aliveIds(actor).filter((id) => id !== targetId),
      targetId,
    );
    timeUp(actor); // → finalPlea
    timeUp(actor); // → 처형 → resolveDeaths
  }

  it('장화홍련 처형 → 피 맺힌 유서 대상 선택 → 동반 사망', () => {
    const actor = startGame();
    skipElection(actor);
    executeTarget(actor, 'p7'); // 장화홍련
    expect(actor.getSnapshot().matches({ resolveDeaths: 'awaitGrudge' })).toBe(true);
    actor.send({ type: 'GRUDGE_TARGET', targetId: 'p1' });
    expect(player(actor, 'p7').alive).toBe(false);
    expect(player(actor, 'p1').alive).toBe(false); // 동반 사망
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
  });

  it('피 맺힌 유서는 10초 미선택(TIME_UP) 시 자동 포기된다', () => {
    const actor = startGame();
    skipElection(actor);
    executeTarget(actor, 'p7');
    timeUp(actor); // 자동 포기
    expect(player(actor, 'p7').alive).toBe(false);
    expect(aliveIds(actor)).toHaveLength(8); // 추가 사망 없음
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
  });

  it('조언자 처형 → 방울 승계 지목 → 지목자가 조언자 역할 인계', () => {
    const actor = startGame();
    // p5(해태)를 단독 출마로 조언자 확정
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p5' });
    timeUp(actor); // → appeal
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p1'], 'p5');
    timeUp(actor); // → day.discussion, advisor = p5
    expect(actor.getSnapshot().context.advisorId).toBe('p5');
    executeTarget(actor, 'p5');
    expect(actor.getSnapshot().matches({ resolveDeaths: 'awaitSuccession' })).toBe(true);
    actor.send({ type: 'ADVISOR_SUCCEED', targetId: 'p6' });
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p6');
    expect(snap.matches({ night: 'goodSkills' })).toBe(true);
  });

  it('까치선비 사망 → 연민 부활 예약 → 다음 새벽 부활하며 중립 전환', () => {
    const actor = startGame();
    skipElection(actor);
    executeTarget(actor, 'p8'); // 까치선비 — 자동 트리거라 입력 대기 없이 밤으로
    expect(player(actor, 'p8').alive).toBe(false);
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
    passNight(actor); // → dawn: 예약 부활 실행
    const revived = player(actor, 'p8');
    expect(revived.alive).toBe(true);
    expect(revived.faction).toBe('NEUTRAL'); // 선 → 중립 전환
    expect(actor.getSnapshot().context.scheduledRevivals).toHaveLength(0);
  });
});

describe('승리 판정 (requirements 8번)', () => {
  it('악 진영 전원 탈락 시 즉시 게임 종료 — 선 진영 승리', () => {
    const actor = startGame();
    skipElection(actor);

    // 1일차: p1(저승사자) 처형
    timeUp(actor);
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    timeUp(actor);
    timeUp(actor); // 처형 → 밤
    expect(actor.getSnapshot().matches({ night: 'goodSkills' })).toBe(true);
    passNight(actor);

    // 2일차 아침: 멸망꽃으로 p2(깡철이) 즉시 처형
    expect(actor.getSnapshot().matches({ day: 'flowerDecision' })).toBe(true);
    actor.send({ type: 'FLOWER_DOOM', targetId: 'p2' });
    expect(player(actor, 'p2').alive).toBe(false);
    expect(actor.getSnapshot().matches({ day: 'discussion' })).toBe(true);

    // 2일차: 마지막 악 p3(구미호) 처형 → 악 전멸 → 게임 종료
    timeUp(actor);
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p3'), 'p3');
    timeUp(actor);
    timeUp(actor);
    const snap = actor.getSnapshot();
    expect(snap.status).toBe('done');
    expect(snap.matches('gameOver')).toBe(true);
    expect(snap.context.winner).toBe('GOOD');
  });
});
