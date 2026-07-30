import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { CHARACTERS, CHARACTER_BY_ID, ROSTER_BY_MODE } from '@korean-tales/shared';
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

/** 7인 모드 배치 — ROSTER_BY_MODE[7] 순서 (깡철이·까치선비 제외) */
function makePlayers7(): GamePlayer[] {
  return ROSTER_BY_MODE[7].map((characterId, i) => ({
    id: `q${i + 1}`,
    seat: i + 1,
    characterId,
    faction: CHARACTER_BY_ID[characterId].faction,
    alive: true,
    skillUses: {},
  }));
}

type Actor = ReturnType<typeof createActor<typeof gameMachine>>;

const timeUp = (actor: Actor) => actor.send({ type: 'TIME_UP' });

/**
 * 밤 전체를 이벤트 주입 없이 통과: 악토론 → 악투표 → 악개별스킬 → 선스킬(해태·도깨비·자청비,
 * 자청비 타이밍 통합 피드백) → dawn(자동으로 resolveDeaths까지 소진) — 13번 재배치 순서
 */
function passNight(actor: Actor) {
  timeUp(actor); // evilDiscussion → evilVote
  timeUp(actor); // evilVote → evilSkills (무투표 → 킬 없음)
  timeUp(actor); // evilSkills → goodSkills
  timeUp(actor); // goodSkills → dawn → (자동) → resolveDeaths 소진
}

/** passNight의 별칭 — 자청비 꽃 선택이 goodSkills에 통합되어 별도 단계가 없어졌다 */
function passNightAndFlower(actor: Actor) {
  passNight(actor);
}

/**
 * 게임은 항상 밤(밤 0)부터 시작한다 — 여기서 조용히 통과시켜 기존 테스트들이
 * 전과 동일하게 firstMorning/개인 발언 상태에서 시작하는 것처럼 쓸 수 있게 한다.
 */
function startGame(rng: () => number = () => 0) {
  const actor = createActor(gameMachine, { input: { players: makePlayers(), rng } });
  actor.start();
  passNightAndFlower(actor);
  return actor;
}

/** 출마자 없이 선출 단계 통과 → 첫날 낮 개인 발언 */
function skipElection(actor: Actor) {
  timeUp(actor);
}

/** 낮 개인 발언 전원 통과 (타이머 만료로) */
function passSpeeches(actor: Actor) {
  let guard = 0;
  while (actor.getSnapshot().matches({ day: 'personalSpeech' }) && guard++ < 20) timeUp(actor);
}

/** voters 전원이 targetId에 투표 */
function voteAll(actor: Actor, voterIds: string[], targetId: string | 'ABSTAIN') {
  for (const voterId of voterIds) actor.send({ type: 'VOTE', voterId, targetId });
}

const aliveIds = (actor: Actor) =>
  actor.getSnapshot().context.players.filter((p) => p.alive).map((p) => p.id);

const player = (actor: Actor, id: string) =>
  actor.getSnapshot().context.players.find((p) => p.id === id)!;

describe('게임 시작 (requirements 4번 — 항상 밤부터)', () => {
  it('setup 직후에는 밤(밤 0)부터 시작한다', () => {
    const actor = createActor(gameMachine, { input: { players: makePlayers(), rng: () => 0 } });
    actor.start();
    // 13번 재배치: 밤은 이제 악 토론부터 시작(선 스킬은 악 투표 이후로 이동)
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
  });
});

describe('첫날 아침 — 조언자 선출 (requirements 7번)', () => {
  it('9인 모드는 출마 신청 상태에서 시작한다', () => {
    const actor = startGame();
    expect(actor.getSnapshot().matches({ firstMorning: 'candidacy' })).toBe(true);
  });

  it('출마자가 없으면 조언자 없이 낮 개인 발언으로 (발언 순서 정순 고정)', () => {
    const actor = startGame();
    timeUp(actor);
    const snap = actor.getSnapshot();
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    expect(snap.context.advisorId).toBeNull();
    expect(snap.context.advisorBroken).toBe(true);
    expect(snap.context.speechQueue[0]).toBe('p1'); // 정순 고정
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
    timeUp(actor); // 확정 → 발언 방향 선택
    expect(actor.getSnapshot().matches({ firstMorning: 'directionChoice' })).toBe(true);
    timeUp(actor); // 방향 선택 시간 종료(미선택 — 기본 정순) → 개인 발언
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p1');
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    // 조언자(p1)는 제일 마지막 발언
    expect(snap.context.speechQueue.at(-1)).toBe('p1');
  });

  it('조언자 확정 직후 발언 방향을 선택하면 타이머를 기다리지 않고 곧바로 개인 발언으로 넘어간다', () => {
    const actor = startGame();
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    timeUp(actor); // → appeal
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p2'], 'p1');
    timeUp(actor); // 확정 → 발언 방향 선택
    expect(actor.getSnapshot().matches({ firstMorning: 'directionChoice' })).toBe(true);
    // 조언자가 아닌 사람이 보내면 무시된다 (actionAuth가 걸러내지만 머신 자체도 advisorId만 반영)
    actor.send({ type: 'ADVISOR_DIRECTION', direction: 'REVERSE' });
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true); // TIME_UP 없이 즉시 전이
    expect(actor.getSnapshot().context.speechDirection).toBe('REVERSE');
  });

  it('발언 방향 선택 시간이 그냥 끝나면 기본값(정순)으로 개인 발언이 시작된다', () => {
    const actor = startGame();
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    timeUp(actor); // → appeal
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p2'], 'p1');
    timeUp(actor); // 확정 → 발언 방향 선택
    timeUp(actor); // 미선택 → 타이머 만료
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);
    expect(actor.getSnapshot().context.speechDirection).toBe('FORWARD');
  });

  it('어필 발언은 현재 발언자 본인의 Skip으로만 즉시 넘어간다', () => {
    const actor = startGame();
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p2' });
    timeUp(actor); // → appeal, 현재 발언자 p1
    actor.send({ type: 'SKIP', playerId: 'p2' }); // 본인 아님 — 무시
    expect(actor.getSnapshot().context.appealQueue[0]).toBe('p1');
    actor.send({ type: 'SKIP', playerId: 'p1' }); // 본인 skip → 다음
    expect(actor.getSnapshot().context.appealQueue[0]).toBe('p2');
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
    timeUp(actor); // 재동표 → 무작위 (rng=0 → p1) → 발언 방향 선택
    expect(actor.getSnapshot().matches({ firstMorning: 'directionChoice' })).toBe(true);
    timeUp(actor); // 방향 선택 시간 종료 → 개인 발언
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p1');
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
  });
});

describe('7인 모드 (requirements 1번 — 조언자 뽑기 제외)', () => {
  it('조언자 선출 없이 바로 첫날 낮 개인 발언에서 시작한다 (정순 고정)', () => {
    const actor = createActor(gameMachine, { input: { players: makePlayers7(), rng: () => 0 } });
    actor.start();
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true); // 7인도 밤부터 시작
    passNightAndFlower(actor);
    const snap = actor.getSnapshot();
    expect(snap.context.mode).toBe(7);
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    expect(snap.context.advisorId).toBeNull();
    expect(snap.context.speechQueue).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  });
});

describe('낮 페이즈 (requirements 5번 + 1번 Skip 규칙)', () => {
  it('개인 발언은 본인 Skip으로 즉시 다음 순서로 넘어간다 (타인 Skip 무시)', () => {
    const actor = startGame();
    skipElection(actor);
    expect(actor.getSnapshot().context.speechQueue[0]).toBe('p1');
    actor.send({ type: 'SKIP', playerId: 'p3' }); // 발언자 아님 — 무시
    expect(actor.getSnapshot().context.speechQueue[0]).toBe('p1');
    actor.send({ type: 'SKIP', playerId: 'p1' });
    expect(actor.getSnapshot().context.speechQueue[0]).toBe('p2');
  });

  it('전체 토론은 생존자 전원 Skip 시 즉시 투표로 전환된다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    expect(actor.getSnapshot().matches({ day: 'discussion' })).toBe(true);
    const ids = aliveIds(actor);
    for (const id of ids.slice(0, -1)) actor.send({ type: 'SKIP', playerId: id });
    expect(actor.getSnapshot().matches({ day: 'discussion' })).toBe(true); // 아직 1명 남음
    actor.send({ type: 'SKIP', playerId: ids.at(-1)! }); // 마지막 1명 → 조기 종료
    expect(actor.getSnapshot().matches({ day: 'vote' })).toBe(true);
  });

  it('전원 기권이면 희생자 없이 밤으로 전환된다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // 토론 종료 → 투표
    // 생존자 전원이 기권해 마지막 투표에서 곧바로 투표 결과 공개(voteReveal)로 전이된다
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // 결과 공개 종료 → 밤
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    expect(aliveIds(actor)).toHaveLength(9);
  });

  it('생존자 전원이 투표를 마치면 타이머 만료 없이도 곧바로 투표 결과 공개로 전이된다 (처형 확정)', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    // TIME_UP을 한 번도 보내지 않고 전원이 투표만으로 voteReveal까지 도달해야 한다
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    actor.send({ type: 'VOTE', voterId: 'p1', targetId: 'ABSTAIN' }); // 대상 본인도 투표(기권)해야 "전원 투표"가 됨
    expect(actor.getSnapshot().matches({ day: 'voteReveal' })).toBe(true);
    timeUp(actor); // 결과 공개 종료 → finalPlea
    expect(actor.getSnapshot().matches({ day: 'finalPlea' })).toBe(true);
    expect(actor.getSnapshot().context.executionTargetId).toBe('p1');
  });

  it('생존자 전원이 투표를 마치면 동표 상황도 타이머 없이 곧바로 결과 공개로 전이된다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    // p2·p9가 4표씩 동표 — 마지막 투표자(p9, 기권)까지 던지는 순간 전원 투표 완료
    const votes: Record<string, string> = {
      p1: 'p2',
      p2: 'p9',
      p3: 'p2',
      p4: 'p2',
      p5: 'p9',
      p6: 'p9',
      p7: 'p9',
      p8: 'p2',
    };
    for (const [voterId, targetId] of Object.entries(votes)) {
      actor.send({ type: 'VOTE', voterId, targetId });
    }
    expect(actor.getSnapshot().matches({ day: 'vote' })).toBe(true); // p9 아직 투표 전
    actor.send({ type: 'VOTE', voterId: 'p9', targetId: 'ABSTAIN' }); // 마지막 투표 — 곧바로 전이
    expect(actor.getSnapshot().matches({ day: 'voteReveal' })).toBe(true);
    timeUp(actor); // 결과 공개 종료 → 동시 발언
    expect(actor.getSnapshot().matches({ day: 'tieSpeech' })).toBe(true);
    expect(actor.getSnapshot().context.tieCandidates.sort()).toEqual(['p2', 'p9']);
  });

  it('재투표도 생존자 전원이 투표를 마치면 타이머 없이 곧바로 결과 공개로 전이된다', () => {
    const actor = startGame(() => 0);
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    voteAll(actor, ['p1'], 'p5');
    voteAll(actor, ['p2'], 'p6');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 동표 → 동시 발언
    timeUp(actor); // → 재투표 (후보는 p5·p6로 제한, 유권자는 생존자 9명 전원)
    const ids = aliveIds(actor);
    for (const id of ids.slice(0, -1)) {
      actor.send({ type: 'VOTE', voterId: id, targetId: id === 'p1' ? 'p5' : 'p6' });
    }
    expect(actor.getSnapshot().matches({ day: 'revote' })).toBe(true); // 아직 1명 남음
    actor.send({ type: 'VOTE', voterId: ids.at(-1)!, targetId: 'p6' }); // 마지막 1표 — 곧바로 전이
    expect(actor.getSnapshot().matches({ day: 'voteReveal' })).toBe(true);
    timeUp(actor); // 결과 공개 종료 → finalPlea
    expect(actor.getSnapshot().context.executionTargetId).toBe('p6');
  });

  it('동표 → 동시 발언 → 재투표 → 재동표면 무작위 1인 처형', () => {
    const actor = startGame(() => 0);
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    voteAll(actor, ['p1'], 'p5');
    voteAll(actor, ['p2'], 'p6');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 동표 → 동시 발언
    expect(actor.getSnapshot().matches({ day: 'tieSpeech' })).toBe(true);
    timeUp(actor); // → 재투표 (후보는 p5·p6로 제한)
    actor.send({ type: 'VOTE', voterId: 'p1', targetId: 'p9' }); // 후보 아님 — 무시
    voteAll(actor, ['p1'], 'p5');
    voteAll(actor, ['p2'], 'p6');
    timeUp(actor); // 재투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 재동표 → 무작위 (rng=0 → p5)
    const snap = actor.getSnapshot();
    expect(snap.matches({ day: 'finalPlea' })).toBe(true);
    expect(snap.context.executionTargetId).toBe('p5');
    timeUp(actor); // 변론 종료 → 처형 → 밤
    expect(player(actor, 'p5').alive).toBe(false);
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
  });

  it('최후의 변론은 처형 대상자 본인 Skip으로 즉시 사망 처리된다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → finalPlea
    actor.send({ type: 'SKIP', playerId: 'p2' }); // 대상자 아님 — 무시
    expect(actor.getSnapshot().matches({ day: 'finalPlea' })).toBe(true);
    actor.send({ type: 'SKIP', playerId: 'p1' }); // 본인 skip → 즉시 처형
    expect(player(actor, 'p1').alive).toBe(false);
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
  });

  it('구미호 유혹: 다음날 토론 후 투표를 통째로 스킵하고 바로 밤으로', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    // 생존자 전원 기권 — 마지막 투표에서 곧바로 voteReveal로 전이된다
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // 결과 공개 종료 → night (evilDiscussion)
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills (킬 없음)
    actor.send({ type: 'GUMIHO_SEDUCE' });
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'FLOWER_PASS' }); // 자청비 패스(같은 창의 다른 스킬엔 영향 없음)
    timeUp(actor); // goodSkills → dawn → (자동, 사망 없음) → 낮 개인 발언
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);
    passSpeeches(actor);
    timeUp(actor); // 토론 종료 → 유혹 발동: 투표 스킵, 바로 밤
    const snap = actor.getSnapshot();
    expect(snap.matches({ night: 'evilDiscussion' })).toBe(true);
    expect(snap.context.seduceNextDay).toBe(false); // 1회성 소모
    // 공개 발표 문구 — 3초간 표시 (13번)
    expect(snap.context.deathAnnouncement).toEqual({
      text: '구미호에 홀려 아무도 투표를 할 수 없게 되었다',
      durationMs: 3000,
    });
  });

  it('구미호가 밤 0(게임 시작 첫 밤)에 유혹을 쓰면 조언자 선출 이후 첫날 투표도 스킵된다 (9인)', () => {
    const actor = createActor(gameMachine, { input: { players: makePlayers(), rng: () => 0 } });
    actor.start();
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills (킬 없음)
    actor.send({ type: 'GUMIHO_SEDUCE' });
    expect(actor.getSnapshot().context.seduceNextDay).toBe(true);
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'FLOWER_PASS' }); // 자청비 패스
    timeUp(actor); // goodSkills → dawn → (자동) → firstMorning(9인) 조언자 출마
    skipElection(actor); // 출마자 없음 → 곧장 낮 개인 발언
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);
    expect(actor.getSnapshot().context.seduceNextDay).toBe(true); // 여전히 유지
    passSpeeches(actor);
    timeUp(actor); // 토론 종료 → 유혹 발동: 투표 스킵, 바로 밤
    const snap = actor.getSnapshot();
    expect(snap.matches({ night: 'evilDiscussion' })).toBe(true);
    expect(snap.context.seduceNextDay).toBe(false);
  });
});

describe('밤 페이즈 (requirements 4번)', () => {
  function toNight(actor: Actor) {
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // → vote
    // 생존자 전원 기권 — 마지막 투표에서 곧바로 voteReveal로 전이된다
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // 결과 공개 종료 → night
  }

  it('해태 투사: 깡철이는 "악 진영이 아닙니다"로 기록된다', () => {
    const actor = startGame();
    toNight(actor);
    // 해태/도깨비 스킬(goodSkills)은 13번 재배치로 악 토론→투표→개별스킬 뒤로 이동
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'HAETAE_INVESTIGATE', targetId: 'p2' }); // 깡철이
    expect(actor.getSnapshot().context.lastInvestigation).toEqual({
      targetId: 'p2',
      result: 'NOT_EVIL',
    });
  });

  it('악 토론은 악 진영 생존자 전원 Skip 시 조기 종료된다', () => {
    const actor = startGame();
    toNight(actor); // 13번 재배치: 밤은 이제 악 토론(evilDiscussion)부터 바로 시작
    actor.send({ type: 'SKIP', playerId: 'p5' }); // 선 진영 — 무시
    actor.send({ type: 'SKIP', playerId: 'p1' });
    actor.send({ type: 'SKIP', playerId: 'p2' });
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    actor.send({ type: 'SKIP', playerId: 'p3' }); // 악 전원 완료
    expect(actor.getSnapshot().matches({ night: 'evilVote' })).toBe(true);
  });

  it('악 투표로 킬 대상 확정 → goodSkills 시간에 그 대상에게 미리 부활꽃 지정 → 새벽에 킬 무효화', () => {
    const actor = startGame();
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    // 자청비는 도깨비 보호 여부를 모른 채, 확정된 킬 대상(p5)에게 미리 부활꽃을 지정한다
    actor.send({ type: 'FLOWER_REVIVE', targetId: 'p5' });
    timeUp(actor); // goodSkills → dawn: 부활꽃 성공으로 킬 무효 — p5는 애초에 죽지 않는다
    const snap = actor.getSnapshot();
    expect(player(actor, 'p5').alive).toBe(true);
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    // 부활꽃 소모 확인
    expect(player(actor, 'p4').skillUses['revival-flower']).toBe(1);
  });

  it('도깨비 보호 성공: 보호 대상이 그날 밤 킬 대상과 같으면 무산되어 아무도 죽지 않는다 (차단 사실 비공개, 스킬 영구 소모)', () => {
    const actor = startGame();
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p5' });
    timeUp(actor); // goodSkills → dawn: 보호 성공으로 킬 무효
    expect(player(actor, 'p5').alive).toBe(true);
    expect(actor.getSnapshot().context.pendingDeaths).toHaveLength(0);
    expect(player(actor, 'p6').skillUses.prank).toBe(1); // 보호 성공으로 1회 소모(이후 재사용 불가)
  });

  it('도깨비 보호와 자청비 부활꽃이 같은 대상(그날 밤 킬 대상)에 겹치면 둘 다 소모 처리된다', () => {
    const actor = startGame();
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    // 도깨비와 자청비 둘 다 서로의 선택을 모른 채 같은 대상(p5)을 지정한다
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p5' });
    actor.send({ type: 'FLOWER_REVIVE', targetId: 'p5' });
    timeUp(actor); // goodSkills → dawn: 둘 다 성공 처리 — 킬 무효, 둘 다 영구 소모
    expect(player(actor, 'p5').alive).toBe(true);
    expect(player(actor, 'p6').skillUses.prank).toBe(1);
    expect(player(actor, 'p4').skillUses['revival-flower']).toBe(1);
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);
  });

  it('도깨비 보호 실패: 보호 대상이 킬 대상과 다르면 킬은 그대로 반영되고 스킬은 소모되지 않아 다음 밤에도 재사용 가능', () => {
    const actor = startGame();
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' }); // 실제 킬 대상은 p5
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p1' }); // p1을 보호했지만
    timeUp(actor); // goodSkills → dawn: 보호 실패, 킬 반영
    expect(player(actor, 'p5').alive).toBe(false);
    expect(player(actor, 'p6').skillUses.prank ?? 0).toBe(0); // 소모되지 않음 — 다음 밤에도 사용 가능
  });
});

describe('사망 확정 트리거 (requirements 5-6항·7번)', () => {
  function executeTarget(actor: Actor, targetId: string) {
    passSpeeches(actor);
    timeUp(actor); // 토론 종료 → 투표
    voteAll(
      actor,
      aliveIds(actor).filter((id) => id !== targetId),
      targetId,
    );
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → finalPlea
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
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    // 공개 발표 문구 — 대상의 배정 번호로 안내 (13번)
    expect(actor.getSnapshot().context.deathAnnouncement).toEqual({
      text: '유서에 쓰인 건 1번입니다',
      durationMs: 4000,
    });
  });

  it('피 맺힌 유서는 10초 미선택(TIME_UP) 시 자동 포기된다', () => {
    const actor = startGame();
    skipElection(actor);
    executeTarget(actor, 'p7');
    timeUp(actor); // 자동 포기
    expect(player(actor, 'p7').alive).toBe(false);
    expect(aliveIds(actor)).toHaveLength(8); // 추가 사망 없음
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
  });

  it('조언자 처형 → 방울 승계 지목 → 지목자가 조언자 역할 인계', () => {
    const actor = startGame();
    // p5(해태)를 단독 출마로 조언자 확정
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p5' });
    timeUp(actor); // → appeal
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p1'], 'p5');
    timeUp(actor); // 확정 → 발언 방향 선택
    timeUp(actor); // → day.personalSpeech, advisor = p5
    expect(actor.getSnapshot().context.advisorId).toBe('p5');
    executeTarget(actor, 'p5');
    expect(actor.getSnapshot().matches({ resolveDeaths: 'awaitSuccession' })).toBe(true);
    actor.send({ type: 'ADVISOR_SUCCEED', targetId: 'p6' });
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBe('p6');
    expect(snap.matches({ night: 'evilDiscussion' })).toBe(true);
  });

  it('까치선비 사망 → 연민 부활 예약 → 다음 새벽 부활하며 중립 전환', () => {
    const actor = startGame();
    skipElection(actor);
    executeTarget(actor, 'p8'); // 까치선비 — 자동 트리거라 입력 대기 없이 밤으로
    expect(player(actor, 'p8').alive).toBe(false);
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    passNight(actor); // → dawn: 예약 부활 실행
    const revived = player(actor, 'p8');
    expect(revived.alive).toBe(true);
    expect(revived.faction).toBe('NEUTRAL'); // 선 → 중립 전환
    expect(actor.getSnapshot().context.scheduledRevivals).toHaveLength(0);
  });
});

describe('스킬 상호작용 복합 케이스 (requirements 3·4·5번)', () => {
  /** 전원 기권으로 낮 통과 → 밤 진입 */
  function toNight(actor: Actor) {
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    // 생존자 전원 기권 — 마지막 투표에서 곧바로 voteReveal로 전이된다
    voteAll(actor, aliveIds(actor), 'ABSTAIN');
    timeUp(actor); // 결과 공개 종료 → night
  }

  it('도깨비 보호가 성공한 밤: 킬은 무산되지만, 그 밤 지정한 길동무는 저승사자가 낮에 처형되면 그대로 동반 사망한다', () => {
    const actor = startGame();
    skipElection(actor);
    toNight(actor);

    // 밤 1(13번 재배치: 악 토론→악 투표→악 개별 스킬→선 스킬 순): 악 킬(p5) 투표 + 저승사자
    // 길동무 지정(p6) → 그 다음 도깨비가 해태(p5)를 보호(자청비는 패스)
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p5' });
    timeUp(actor); // evilVote → evilSkills
    actor.send({ type: 'JEOSEUNG_COMPANION', targetId: 'p6' });
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p5' });
    timeUp(actor); // goodSkills → dawn → (자동) → 낮 개인 발언

    // 새벽: 보호 성공으로 킬 무효 — "사망자 없음" (차단 사실 비공개)
    expect(player(actor, 'p5').alive).toBe(true);
    expect(actor.getSnapshot().context.pendingDeaths).toHaveLength(0);

    // 2일차 낮: 저승사자(p1) 처형 → 장난과 무관하게 길동무(p6) 동반 사망
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → finalPlea
    timeUp(actor); // → 처형 → 사망 처리
    expect(player(actor, 'p1').alive).toBe(false);
    expect(player(actor, 'p6').alive).toBe(false); // 동반 사망 — 장난은 밤 킬만 막는다
    expect(player(actor, 'p5').alive).toBe(true);
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    // 공개 발표 문구 — 대상의 배정 번호로 안내 (13번)
    expect(actor.getSnapshot().context.deathAnnouncement).toEqual({
      text: '저승사자가 사자의 명부에 6번을 적었습니다',
      durationMs: 4000,
    });
  });

  it('저승사자가 길동무를 지정한 밤 자청비의 멸망꽃으로 죽으면 길동무는 동반 사망하지 않는다', () => {
    const actor = startGame();
    skipElection(actor);
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote (무투표)
    timeUp(actor); // evilVote → evilSkills
    actor.send({ type: 'JEOSEUNG_COMPANION', targetId: 'p6' });
    timeUp(actor); // evilSkills → goodSkills (킬 없음, 멸망꽃은 킬 대상과 무관하게 항상 가능)
    actor.send({ type: 'FLOWER_DOOM', targetId: 'p1' }); // 저승사자(p1) 자신을 멸망꽃으로 처형
    timeUp(actor); // goodSkills → dawn → (자동) → 낮 개인 발언
    const snap = actor.getSnapshot();
    expect(player(actor, 'p1').alive).toBe(false);
    expect(player(actor, 'p6').alive).toBe(true); // 길동무 동반 사망 미발동 (봉인)
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    expect(snap.context.awaiting).toBeNull();
  });

  it('멸망꽃으로 죽은 장화홍련은 피 맺힌 유서 기회 자체가 봉인된다', () => {
    const actor = startGame();
    skipElection(actor);
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote (무투표)
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'FLOWER_DOOM', targetId: 'p7' }); // 장화홍련 즉시 처형
    timeUp(actor); // goodSkills → dawn → (자동) → 낮 개인 발언
    // 유서 입력 대기 없이 곧장 낮 진행 (봉인)
    const snap = actor.getSnapshot();
    expect(player(actor, 'p7').alive).toBe(false);
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    expect(snap.context.awaiting).toBeNull();
  });

  it('멸망꽃으로 죽은 까치선비도 연민으로 부활한다 (사망 원인 불문)', () => {
    const actor = startGame();
    skipElection(actor);
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote (무투표)
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'FLOWER_DOOM', targetId: 'p8' }); // 까치선비 즉시 처형
    timeUp(actor); // goodSkills → dawn → (자동) → 낮 개인 발언
    expect(player(actor, 'p8').alive).toBe(false);
    expect(actor.getSnapshot().context.scheduledRevivals).toEqual(['p8']); // 연민 예약
    toNight(actor);
    passNight(actor); // → 3일차 새벽: 예약 부활
    const revived = player(actor, 'p8');
    expect(revived.alive).toBe(true);
    expect(revived.faction).toBe('NEUTRAL');
  });

  it('부활자의 이미 사용한 1회성 스킬은 소모된 상태로 유지된다 (도깨비 장난 — 보호 성공 후)', () => {
    const actor = startGame();
    skipElection(actor);
    toNight(actor);

    // 밤 1: 도깨비가 p1을 보호 → 악이 p1을 킬 시도 → 보호 성공, 장난 영구 소모
    // (13번 재배치: 도깨비 스킬은 이제 악 투표 이후 goodSkills 단계에서 지정)
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p2', targetId: 'p1' });
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p1' });
    timeUp(actor); // goodSkills → 2일차 아침: 보호 성공
    expect(player(actor, 'p1').alive).toBe(true);
    expect(player(actor, 'p6').skillUses.prank).toBe(1);
    toNight(actor);

    // 밤 2: 장난은 이미 소모되어 재사용 불가 — guard가 차단, 도깨비(p6)는 무방비로 킬당함
    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p2', targetId: 'p6' });
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p6' }); // guard가 차단해야 함
    expect(actor.getSnapshot().context.dokkaebiProtectTargetId).toBeNull();
    // 자청비가 미리 부활꽃을 지정(도깨비 보호는 이미 위에서 막혔음) — 사용한 장난은 복구되지 않는다
    actor.send({ type: 'FLOWER_REVIVE', targetId: 'p6' });
    timeUp(actor); // goodSkills → 3일차 새벽: 부활꽃 성공으로 킬 무효
    const revived = player(actor, 'p6');
    expect(revived.alive).toBe(true);
    expect(revived.skillUses.prank).toBe(1); // 소모 유지

    // 그 밤에도 장난 재사용 불가
    toNight(actor);
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    actor.send({ type: 'DOKKAEBI_PRANK', targetId: 'p1' });
    expect(actor.getSnapshot().context.dokkaebiProtectTargetId).toBeNull();
  });
});

describe('승리 판정 (requirements 8번)', () => {
  it('팀 전원 투항(TEAM_SURRENDER) 시 어느 상태에서든 즉시 상대 진영 승리', () => {
    const actor = startGame();
    skipElection(actor); // 첫날 낮 개인 발언 중
    actor.send({ type: 'TEAM_SURRENDER', faction: 'GOOD' }); // 선 전원 항복
    const snap = actor.getSnapshot();
    expect(snap.status).toBe('done');
    expect(snap.context.winner).toBe('EVIL'); // 상대 승리 — 일차 무관
  });

  it('사망 트리거 연쇄(피 맺힌 유서)로 마지막 악이 죽어도 즉시 승리 판정된다', () => {
    // 악 진영 중 p1(저승사자)만 생존한 상태로 시작
    const players = makePlayers().map((p) =>
      p.id === 'p2' || p.id === 'p3' ? { ...p, alive: false } : p,
    );
    const actor = createActor(gameMachine, { input: { players, rng: () => 0 } });
    actor.start();
    passNightAndFlower(actor); // 밤 0 통과 (자청비 꽃 자동 패스 포함)
    timeUp(actor); // 선출 스킵
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    // 장화홍련(p7) 처형 → 유서로 마지막 악 p1 지목
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p7'), 'p7');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 변론
    timeUp(actor); // → 처형 → 유서 대기
    actor.send({ type: 'GRUDGE_TARGET', targetId: 'p1' }); // 연쇄 사망 → 악 전멸
    const snap = actor.getSnapshot();
    expect(snap.status).toBe('done');
    expect(snap.context.winner).toBe('GOOD');
  });

  it('중립(바리공주) 전멸 시 선 진영 생존자 수와 무관하게 즉시 악 진영 승리', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p9'), 'p9'); // 바리공주(p9) 처형
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 최후의 변론
    timeUp(actor); // → 처형 → 사망 처리
    const snap = actor.getSnapshot();
    expect(player(actor, 'p9').alive).toBe(false);
    expect(snap.status).toBe('done');
    expect(snap.context.winner).toBe('EVIL'); // 선 진영은 대부분 생존 중이었음에도 즉시 악 승리
  });

  it('낮에 까치선비가 처형되어 연민 부활이 예약된 뒤, 같은 밤 바리공주가 죽어도 다음 새벽 까치선비가 중립으로 부활해 게임이 계속된다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p8'), 'p8'); // 까치선비(p8) 처형
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 변론
    timeUp(actor); // → 처형 → 사망 처리(연민 자동 예약) → 밤
    expect(player(actor, 'p8').alive).toBe(false);
    expect(actor.getSnapshot().context.scheduledRevivals).toEqual(['p8']);
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);

    timeUp(actor); // evilDiscussion → evilVote
    actor.send({ type: 'EVIL_KILL_VOTE', voterId: 'p1', targetId: 'p9' }); // 바리공주(p9) 킬 지정
    timeUp(actor); // evilVote → evilSkills
    timeUp(actor); // evilSkills → goodSkills
    timeUp(actor); // goodSkills → dawn: 예약 부활이 밤 킬 판정보다 먼저 반영됨

    const snap = actor.getSnapshot();
    expect(player(actor, 'p8').alive).toBe(true); // 예약된 부활은 바리공주의 사망과 무관하게 실행
    expect(player(actor, 'p8').faction).toBe('NEUTRAL');
    expect(player(actor, 'p9').alive).toBe(false);
    expect(snap.status).toBe('active'); // 중립 전멸이 아니므로 게임 계속
    expect(snap.context.winner).toBeNull();
  });

  it('악 진영 전원 탈락 시 즉시 게임 종료 — 선 진영 승리', () => {
    const actor = startGame();
    skipElection(actor);

    // 1일차: p1(저승사자) 처형
    passSpeeches(actor);
    timeUp(actor);
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 변론
    timeUp(actor); // 처형 → 밤
    expect(actor.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills (무투표)
    timeUp(actor); // evilSkills → goodSkills

    // goodSkills 시간: 멸망꽃으로 p2(깡철이) 즉시 처형 예약
    actor.send({ type: 'FLOWER_DOOM', targetId: 'p2' });
    timeUp(actor); // goodSkills → dawn → (자동) → 낮 개인 발언
    expect(player(actor, 'p2').alive).toBe(false);
    expect(actor.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);

    // 2일차: 마지막 악 p3(구미호) 처형 → 악 전멸 → 게임 종료
    passSpeeches(actor);
    timeUp(actor);
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p3'), 'p3');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // 결과 공개 종료 → 변론
    timeUp(actor);
    const snap = actor.getSnapshot();
    expect(snap.status).toBe('done');
    expect(snap.matches('gameOver')).toBe(true);
    expect(snap.context.winner).toBe('GOOD');
  });
});

describe('도중에 나가기 (FORFEIT)', () => {
  it('생존자가 나가면 즉시 사망 처리되고, 승리 조건이 아직 안 갖춰졌으면 현재 페이즈가 그대로 유지된다', () => {
    const actor = startGame();
    skipElection(actor); // 첫날 낮 개인 발언 중 (p1 차례)
    actor.send({ type: 'FORFEIT', playerId: 'p5' }); // 아직 발언 순서가 안 된 사람이 나감
    const snap = actor.getSnapshot();
    expect(player(actor, 'p5').alive).toBe(false);
    expect(snap.status).toBe('active'); // 게임은 계속
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true); // 진행 중이던 페이즈 그대로
    expect(snap.context.speechQueue).not.toContain('p5'); // 나중에 그 차례가 와도 멈추지 않도록 큐에서 제거
  });

  it('나감으로써 마지막 악 진영이 사라지면 즉시 게임이 종료된다', () => {
    // 악 진영 중 p1(저승사자)만 생존한 상태로 시작
    const players = makePlayers().map((p) =>
      p.id === 'p2' || p.id === 'p3' ? { ...p, alive: false } : p,
    );
    const actor = createActor(gameMachine, { input: { players, rng: () => 0 } });
    actor.start();
    passNightAndFlower(actor);
    timeUp(actor); // 선출 스킵
    actor.send({ type: 'FORFEIT', playerId: 'p1' }); // 마지막 악이 나감 → 악 전멸
    const snap = actor.getSnapshot();
    expect(snap.status).toBe('done');
    expect(snap.context.winner).toBe('GOOD');
  });

  it('이미 사망한 사람은 다시 나갈 수 없다 (중복 요청 무시)', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    voteAll(actor, aliveIds(actor).filter((id) => id !== 'p1'), 'p1');
    timeUp(actor); // 투표 종료 → 투표 결과 공개(voteReveal)
    timeUp(actor); // → 변론
    timeUp(actor); // → 처형
    expect(player(actor, 'p1').alive).toBe(false);
    actor.send({ type: 'FORFEIT', playerId: 'p1' }); // 이미 죽은 사람 — 아무 효과 없음
    expect(actor.getSnapshot().status).toBe('active');
  });

  it('나가는 사람이 조언자였다면 승계 절차 없이 즉시 파기되어 발언 순서가 정순 고정된다', () => {
    const actor = startGame(() => 0);
    actor.send({ type: 'CANDIDACY_APPLY', playerId: 'p1' });
    timeUp(actor); // → appeal
    timeUp(actor); // → electionDiscussion
    timeUp(actor); // → electionVote
    voteAll(actor, ['p2', 'p3'], 'p1');
    timeUp(actor); // p1이 조언자로 확정 → 발언 방향 선택
    timeUp(actor); // 방향 선택 시간 종료 → 낮 개인 발언 시작
    expect(actor.getSnapshot().context.advisorId).toBe('p1');

    actor.send({ type: 'FORFEIT', playerId: 'p1' });
    const snap = actor.getSnapshot();
    expect(snap.context.advisorId).toBeNull();
    expect(snap.context.advisorBroken).toBe(true);
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true); // 페이즈는 그대로 유지
  });

  it('나가는 것은 사망 트리거를 발동하지 않는다 — 길동무를 지정해둔 저승사자가 나가도 길동무는 죽지 않는다', () => {
    const actor = startGame();
    skipElection(actor);
    passSpeeches(actor);
    timeUp(actor); // 토론 → 투표
    voteAll(actor, aliveIds(actor), 'ABSTAIN'); // 전원 기권 — 마지막 투표에서 곧바로 voteReveal로 전이
    timeUp(actor); // 결과 공개 종료 → 밤
    timeUp(actor); // evilDiscussion → evilVote
    timeUp(actor); // evilVote → evilSkills (무투표)
    actor.send({ type: 'JEOSEUNG_COMPANION', targetId: 'p6' }); // 저승사자(p1)가 길동무로 도깨비(p6) 지정
    actor.send({ type: 'FORFEIT', playerId: 'p1' }); // 저승사자가 도중에 나감 — "사망"이 아니라 이탈
    expect(player(actor, 'p1').alive).toBe(false);
    expect(player(actor, 'p6').alive).toBe(true); // 길동무 동반 사망 미발동
  });
});
