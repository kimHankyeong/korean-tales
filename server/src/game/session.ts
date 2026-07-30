/**
 * GameSession — 상태 머신(machine.ts)과 서버 권위 타이머(timer.ts)를 결합한다.
 *
 * 동작 방식 (requirements 2번 섹션):
 * - 상태 전이를 구독하다가, 시간 제한이 있는 상태에 들어오면 TIMER_CONFIG(또는 방 옵션)
 *   기준으로 PhaseTimer를 시작하고, 만료 시 머신에 TIME_UP을 자동 발행한다.
 * - 같은 페이즈가 유지되는 이벤트(투표 등록, skip 집계 등)에는 타이머를 건드리지 않는다.
 *   페이즈 키가 바뀔 때만 재시작 — 개인 발언은 발언자가 바뀌면 키가 바뀌어 새로 시작된다.
 * - 클라이언트 동기화: 타이머 시작 시 onTimerSync 콜백으로 TimerSyncPayload를 넘긴다.
 *   Socket.io 연동 시 io.to(roomId).emit(SOCKET_EVENTS.timerSync, payload) 형태로 쓰면 된다.
 *   (UI·룸 연동은 이후 세션)
 */

import { createActor, type Actor, type SnapshotFrom } from 'xstate';
import { TIMER_CONFIG, type TimerSyncPayload } from '@korean-tales/shared';
import { gameMachine, type GameMachine } from './machine';
import { PhaseTimer } from './timer';
import type { GameEvent, GameInput } from './types';

export type GameSnapshot = SnapshotFrom<GameMachine>;

/** 시간 제한이 있는 상태 → { 페이즈 키, 제한시간(초) }. 시간 제한이 없으면 null */
export function getTimerSpec(snapshot: GameSnapshot): { key: string; seconds: number } | null {
  const { context } = snapshot;

  /* 첫날 아침 — 조언자 선출 (2번 표: 7초/각 20초/50초/7초) */
  if (snapshot.matches({ firstMorning: 'candidacy' }))
    return { key: 'candidacy', seconds: TIMER_CONFIG.advisorCandidacy };
  if (snapshot.matches({ firstMorning: 'appeal' }))
    // 발언자별로 키가 달라져 발언자 교체마다 타이머가 재시작된다
    return { key: `appeal:${context.appealQueue[0]}`, seconds: TIMER_CONFIG.advisorAppeal };
  if (snapshot.matches({ firstMorning: 'electionDiscussion' }))
    return { key: 'electionDiscussion', seconds: TIMER_CONFIG.advisorDiscussion };
  if (snapshot.matches({ firstMorning: 'electionVote' }))
    return { key: 'electionVote', seconds: TIMER_CONFIG.advisorVote };
  if (snapshot.matches({ firstMorning: 'electionRevote' }))
    return { key: 'electionRevote', seconds: TIMER_CONFIG.advisorVote };
  if (snapshot.matches({ firstMorning: 'directionChoice' }))
    return { key: 'directionChoice', seconds: TIMER_CONFIG.advisorDirectionChoice };

  /* 낮 (2번 표 + 방 옵션) */
  if (snapshot.matches({ day: 'personalSpeech' }))
    return {
      key: `speech:${context.day}:${context.speechQueue[0]}`,
      seconds: context.roomSettings.personalSpeechSeconds, // 방 옵션 80/120초
    };
  if (snapshot.matches({ day: 'discussion' }))
    return { key: `discussion:${context.day}`, seconds: context.roomSettings.discussionSeconds }; // 방 옵션 3분/5분
  if (snapshot.matches({ day: 'vote' }))
    return { key: `vote:${context.day}`, seconds: TIMER_CONFIG.vote };
  // 처형 투표(재투표 포함) 종료 직후 결과 공개(9번 피드백) — 끝나야 다음 단계로 넘어간다
  if (snapshot.matches({ day: 'voteReveal' }))
    return { key: `voteReveal:${context.day}`, seconds: TIMER_CONFIG.voteReveal };
  if (snapshot.matches({ day: 'tieSpeech' }))
    return { key: `tieSpeech:${context.day}`, seconds: TIMER_CONFIG.tieSpeech };
  if (snapshot.matches({ day: 'revote' }))
    return { key: `revote:${context.day}`, seconds: TIMER_CONFIG.vote };
  if (snapshot.matches({ day: 'finalPlea' }))
    return { key: `finalPlea:${context.day}`, seconds: TIMER_CONFIG.finalPlea };

  /* 밤 (2번 표) */
  // 해태·도깨비·자청비 동시 진행(자청비 타이밍 통합 피드백으로 이 창에 합류)
  if (snapshot.matches({ night: 'goodSkills' }))
    return { key: `goodSkills:${context.day}`, seconds: TIMER_CONFIG.nightGoodSkillDecision };
  if (snapshot.matches({ night: 'evilDiscussion' }))
    return { key: `evilDiscussion:${context.day}`, seconds: TIMER_CONFIG.nightEvilDiscussion };
  if (snapshot.matches({ night: 'evilVote' }))
    return { key: `evilVote:${context.day}`, seconds: TIMER_CONFIG.vote };
  if (snapshot.matches({ night: 'evilSkills' }))
    return { key: `evilSkills:${context.day}`, seconds: TIMER_CONFIG.nightEvilIndividualSkill };

  /* 사망 확정 트리거 (2번 표: 각 10초) */
  if (snapshot.matches({ resolveDeaths: 'awaitGrudge' }))
    return { key: `grudge:${context.awaiting?.playerId}`, seconds: TIMER_CONFIG.deathJanghwaDecision };
  if (snapshot.matches({ resolveDeaths: 'awaitSuccession' }))
    return { key: `succession:${context.awaiting?.playerId}`, seconds: TIMER_CONFIG.deathAdvisorDecision };

  // dawn·advance(통과 상태)·gameOver — 타이머 없음
  return null;
}

export interface GameSessionOptions extends GameInput {
  /** 타이머 시작/갱신 시 호출 — Socket.io 브로드캐스트 연결 지점 */
  onTimerSync?: (payload: TimerSyncPayload) => void;
  /** 타이머 없는 상태로 전환 시 호출 (게임 종료 포함) */
  onTimerClear?: () => void;
  /** 상태 전이 관찰용 (로깅·브로드캐스트) */
  onSnapshot?: (snapshot: GameSnapshot) => void;
  /** 테스트용 시계 주입 — 미지정 시 Date.now */
  now?: () => number;
}

export class GameSession {
  readonly actor: Actor<GameMachine>;
  private readonly timer = new PhaseTimer();
  private readonly now: () => number;

  constructor(private readonly options: GameSessionOptions) {
    this.now = options.now ?? Date.now;
    this.actor = createActor(gameMachine, {
      input: {
        players: options.players,
        rng: options.rng,
        mode: options.mode,
        settings: options.settings,
      },
    });
  }

  /** 게임 시작 — 초기 상태(선출 출마 or 첫날 낮)의 타이머까지 즉시 가동 */
  start(): void {
    this.actor.subscribe((snapshot) => {
      this.options.onSnapshot?.(snapshot);
      this.syncTimer(snapshot);
    });
    this.actor.start();
    this.syncTimer(this.actor.getSnapshot());
  }

  /** 외부(소켓 핸들러) 이벤트 주입 — 전이가 일어나면 구독 콜백에서 타이머가 재동기화된다 */
  send(event: GameEvent): void {
    this.actor.send(event);
  }

  getSnapshot(): GameSnapshot {
    return this.actor.getSnapshot();
  }

  /** 현재 페이즈 타이머의 남은 시간(ms) — 재접속 클라이언트 동기화용 */
  remainingMs(): number {
    return this.timer.remainingMs(this.now());
  }

  /** 재접속한 플레이어에게 다시 보낼 현재 타이머 상태 — 타이머 없는 페이즈면 null (1번 피드백) */
  currentTimerSync(): TimerSyncPayload | null {
    if (!this.timer.isRunning) return null;
    const spec = getTimerSpec(this.actor.getSnapshot());
    if (!spec) return null;
    return {
      phaseKey: spec.key,
      durationSeconds: spec.seconds,
      endsAt: this.now() + this.remainingMs(),
      serverNow: this.now(),
    };
  }

  stop(): void {
    this.timer.cancel();
    this.actor.stop();
  }

  /** 상태 전이 때마다 호출 — 페이즈 키가 바뀐 경우에만 타이머를 재시작한다 */
  private syncTimer(snapshot: GameSnapshot): void {
    if (snapshot.status !== 'active') {
      // 게임 종료 — 타이머 정리
      if (this.timer.isRunning) {
        this.timer.cancel();
        this.options.onTimerClear?.();
      }
      return;
    }

    const spec = getTimerSpec(snapshot);
    if (!spec) {
      if (this.timer.isRunning) {
        this.timer.cancel();
        this.options.onTimerClear?.();
      }
      return;
    }

    // 같은 페이즈 유지(투표 등록·skip 집계 등) — 타이머를 건드리지 않는다
    if (spec.key === this.timer.key) return;

    const durationMs = spec.seconds * 1000;
    this.timer.start(spec.key, durationMs, () => this.send({ type: 'TIME_UP' }));
    this.options.onTimerSync?.({
      phaseKey: spec.key,
      durationSeconds: spec.seconds,
      endsAt: this.now() + durationMs,
      serverNow: this.now(),
    });
  }
}
