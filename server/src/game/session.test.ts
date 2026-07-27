import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, TIMER_CONFIG, type TimerSyncPayload } from '@korean-tales/shared';
import { GameSession } from './session';
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

function makeSession(overrides?: Partial<ConstructorParameters<typeof GameSession>[0]>) {
  const syncs: TimerSyncPayload[] = [];
  const session = new GameSession({
    players: makePlayers(),
    rng: () => 0,
    onTimerSync: (p) => syncs.push(p),
    ...overrides,
  });
  return { session, syncs };
}

/**
 * 밤 0(게임은 항상 밤부터 시작) 총 소요 시간 — 악 토론·악 투표·악 개별 스킬·선 진영
 * 스킬(해태·도깨비·자청비, 자청비 타이밍 통합 피드백으로 이 창에 합류) → 9인 모드
 * 조언자 선출 타이머 직전까지.
 */
const NIGHT_ZERO_MS =
  (TIMER_CONFIG.nightGoodSkillDecision +
    TIMER_CONFIG.nightEvilDiscussion +
    TIMER_CONFIG.vote +
    TIMER_CONFIG.nightEvilIndividualSkill) *
  1000;

describe('GameSession (타이머 ↔ 상태 머신 결합)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('시작 시 밤(밤 0) 악 토론 타이머를 먼저 시작한다 (13번 재배치)', () => {
    const { session, syncs } = makeSession();
    session.start();
    expect(syncs).toHaveLength(1);
    expect(syncs[0]).toMatchObject({
      phaseKey: 'evilDiscussion:0',
      durationSeconds: TIMER_CONFIG.nightEvilDiscussion,
    });
    session.stop();
  });

  it('밤 0을 통과하면 출마 신청 타이머(7초)로 이어진다', () => {
    const { session, syncs } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    const candidacySync = syncs.at(-1)!;
    expect(candidacySync).toMatchObject({
      phaseKey: 'candidacy',
      durationSeconds: TIMER_CONFIG.advisorCandidacy,
    });
    expect(session.remainingMs()).toBe(TIMER_CONFIG.advisorCandidacy * 1000);
    session.stop();
  });

  it('타이머 만료 시 TIME_UP이 자동 발행되어 상태가 전이된다', () => {
    const { session } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000);
    // 출마자 없음 → 조언자 없이 첫날 낮 개인 발언
    expect(session.getSnapshot().matches({ day: 'personalSpeech' })).toBe(true);
    session.stop();
  });

  it('개인 발언 타이머는 방 옵션(80초/120초)을 따른다', () => {
    const { session, syncs } = makeSession({
      settings: { personalSpeechSeconds: 120, discussionSeconds: 300 },
    });
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000);
    const speechSync = syncs.at(-1)!;
    expect(speechSync.phaseKey).toBe('speech:1:p1');
    expect(speechSync.durationSeconds).toBe(120);
    session.stop();
  });

  it('발언자 본인 Skip 시 다음 발언자 타이머로 즉시 재시작된다', () => {
    const { session, syncs } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000); // → speech p1
    session.send({ type: 'SKIP', playerId: 'p1' });
    expect(syncs.at(-1)).toMatchObject({ phaseKey: 'speech:1:p2', durationSeconds: 80 });
    session.stop();
  });

  it('같은 페이즈 안의 이벤트(투표 등록)는 타이머를 재시작하지 않는다', () => {
    const { session, syncs } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    // 출마 7초 → 개인 발언 9명 × 80초 → 전체 토론 180초 → 투표
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000);
    vi.advanceTimersByTime(9 * 80 * 1000);
    vi.advanceTimersByTime(180 * 1000);
    expect(session.getSnapshot().matches({ day: 'vote' })).toBe(true);
    const countBefore = syncs.length;
    const remaining = session.remainingMs();
    session.send({ type: 'VOTE', voterId: 'p1', targetId: 'p5' });
    expect(syncs.length).toBe(countBefore); // 재브로드캐스트 없음
    expect(session.remainingMs()).toBe(remaining); // 타이머 유지
    session.stop();
  });

  it('타이머 진행만으로 첫날 낮 전체가 자동 진행되어 밤에 도달한다', () => {
    const { session } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000); // 선출(출마 없음)
    vi.advanceTimersByTime(9 * 80 * 1000); // 개인 발언 9명
    vi.advanceTimersByTime(180 * 1000); // 전체 토론
    vi.advanceTimersByTime(TIMER_CONFIG.vote * 1000); // 투표(전원 미투표=기권) → 투표 결과 공개
    vi.advanceTimersByTime(TIMER_CONFIG.voteReveal * 1000); // 결과 공개 종료 → 밤
    expect(session.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    // 밤도 자동 진행: 악토론 90 → 악투표 10 → 악개별 10 → 선스킬 10 → 새벽 (13번 재배치)
    vi.advanceTimersByTime(
      (TIMER_CONFIG.nightEvilDiscussion +
        TIMER_CONFIG.vote +
        TIMER_CONFIG.nightEvilIndividualSkill +
        TIMER_CONFIG.nightGoodSkillDecision) *
        1000,
    );
    const snap = session.getSnapshot();
    expect(snap.context.day).toBe(2);
    // 2일차 낮 개인 발언 시작 (자청비 부활꽃/멸망꽃은 goodSkills 시간에 자동 패스됨)
    expect(snap.matches({ day: 'personalSpeech' })).toBe(true);
    session.stop();
  });

  it('입력 대기 트리거(피 맺힌 유서)도 10초 타이머로 자동 포기된다', () => {
    const { session, syncs } = makeSession();
    session.start();
    vi.advanceTimersByTime(NIGHT_ZERO_MS);
    vi.advanceTimersByTime(TIMER_CONFIG.advisorCandidacy * 1000);
    vi.advanceTimersByTime(9 * 80 * 1000);
    vi.advanceTimersByTime(180 * 1000);
    // 전원이 장화홍련(p7) 투표 → 최후의 변론 → 처형 → 유서 대기
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9']) {
      session.send({ type: 'VOTE', voterId: id, targetId: 'p7' });
    }
    vi.advanceTimersByTime(TIMER_CONFIG.vote * 1000); // → 투표 결과 공개
    vi.advanceTimersByTime(TIMER_CONFIG.voteReveal * 1000); // 결과 공개 종료 → finalPlea
    vi.advanceTimersByTime(TIMER_CONFIG.finalPlea * 1000); // → 처형 → awaitGrudge
    expect(session.getSnapshot().matches({ resolveDeaths: 'awaitGrudge' })).toBe(true);
    expect(syncs.at(-1)).toMatchObject({
      phaseKey: 'grudge:p7',
      durationSeconds: TIMER_CONFIG.deathJanghwaDecision,
    });
    vi.advanceTimersByTime(TIMER_CONFIG.deathJanghwaDecision * 1000); // 미선택 → 자동 포기
    expect(session.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    session.stop();
  });
});
