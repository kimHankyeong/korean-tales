/**
 * korean_tales 게임 전체 상태 머신 (XState v5)
 * — docs/requirements.md 1번(방 옵션·Skip)·4번(밤)·5번(낮)·7번(조언자 출마)·8번(승리 조건) 기반
 * — 상태 전이 다이어그램: docs/fsm.md
 *
 * 설계 원칙:
 * - 서버 권위 타이머는 session.ts(GameSession)가 담당한다. 머신은 시간 만료를
 *   TIME_UP 이벤트로만 받고, 각 상태의 제한시간 값은 shared의 TIMER_CONFIG·RoomTimerSettings를 따른다.
 * - 모든 guard/action은 logic.ts의 순수 함수를 조합해서만 동작한다.
 * - 무작위 판정(동표 무작위 처형 등)은 context.rng로 주입받는다.
 *
 * Skip 규칙 (1번 섹션):
 * - 개인 발언(어필·낮 개인 발언)·최후의 변론: 발언 당사자 본인의 SKIP만 유효 → 즉시 다음
 * - 전체 토론(선출 토론·낮 토론·악 토론): 해당 생존자 전원이 SKIP하면 조기 종료
 *
 * 상태 흐름 개요:
 *   setup → firstMorning(조언자 선출, 9인 모드만) → day ⇄ night 반복 → gameOver
 *   사망 발생 시 공통적으로 resolveDeaths 서브 상태를 경유한다.
 */

import { and, assign, setup } from 'xstate';
import { ADVISOR_ELECTION_BY_MODE, DEFAULT_ROOM_TIMER_SETTINGS } from '@korean-tales/shared';
import {
  alivePlayers,
  canUseSkill,
  checkWin,
  computeSpeechOrder,
  getPlayer,
  investigate,
  isRevivableTonight,
  markSkillUsed,
  pickRandom,
  processDawn,
  processDeathQueue,
  resolveNightKillTarget,
  resolveVoteOutcome,
} from './logic';
import type { GameContext, GameEvent, GameInput, PendingDeath } from './types';

/** processDeathQueue에 넘길 컨텍스트 조각 추출 */
function deathState(context: GameContext) {
  return {
    players: context.players,
    pendingDeaths: context.pendingDeaths,
    scheduledRevivals: context.scheduledRevivals,
    advisorId: context.advisorId,
    advisorBroken: context.advisorBroken,
    companionTargetId: context.companionTargetId,
    awaiting: context.awaiting,
  };
}

/** 전체 토론 skip 완주 판정: skipper 본인 포함 대상 전원이 skip을 눌렀는가 */
function skipCompletes(targets: readonly { id: string }[], skipVotes: readonly string[], skipperId: string): boolean {
  if (!targets.some((p) => p.id === skipperId)) return false; // 대상이 아닌 사람의 skip은 무효
  return targets.every((p) => p.id === skipperId || skipVotes.includes(p.id));
}

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
    input: {} as GameInput,
  },

  guards: {
    /* ── 모드 ── */
    // 전이 조건: 7인 모드 — 조언자 선출 없이 게임 시작 (발언 순서 정순 고정)
    electionDisabled: ({ context }) => !ADVISOR_ELECTION_BY_MODE[context.mode],

    /* ── 조언자 선출 ── */
    // 전이 조건: 출마 신청자가 아무도 없음 → 조언자 없이 낮 진행
    noCandidates: ({ context }) => context.candidates.length === 0,
    // 전이 조건: 어필 발언이 마지막 사람까지 끝남
    lastAppeal: ({ context }) => context.appealQueue.length <= 1,
    // 어필 Skip: 현재 발언자 본인만 유효
    currentAppealSpeakerSkip: ({ context, event }) =>
      event.type === 'SKIP' && context.appealQueue[0] === event.playerId,
    // 유효 출마: 생존자이며 아직 신청 안 함
    validCandidacy: ({ context, event }) => {
      if (event.type !== 'CANDIDACY_APPLY') return false;
      const p = getPlayer(context.players, event.playerId);
      return !!p?.alive && !context.candidates.includes(event.playerId);
    },
    // 유효 선출 투표: 출마자는 투표권 없음(7번 섹션), 대상은 출마자여야 함
    validElectionVote: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const voter = getPlayer(context.players, event.voterId);
      return (
        !!voter?.alive &&
        !context.candidates.includes(event.voterId) &&
        event.targetId !== 'ABSTAIN' &&
        context.candidates.includes(event.targetId)
      );
    },
    // 유효 선출 재투표: 후보가 동표자로 제한됨
    validElectionRevote: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const voter = getPlayer(context.players, event.voterId);
      return (
        !!voter?.alive &&
        !context.candidates.includes(event.voterId) &&
        event.targetId !== 'ABSTAIN' &&
        context.tieCandidates.includes(event.targetId)
      );
    },
    // 전이 조건: 최다 득표자 단독 확정
    voteDecided: ({ context }) => resolveVoteOutcome(context.votes).kind === 'DECIDED',
    // 전이 조건: 득표자 없음 (처형 투표: 전원 기권 → 희생자 없이 밤으로)
    voteNoTarget: ({ context }) => resolveVoteOutcome(context.votes).kind === 'NO_TARGET',
    // 전체 토론 skip 완주: 생존자 전원 (선출 토론·낮 토론 공용)
    allAliveSkipComplete: ({ context, event }) =>
      event.type === 'SKIP' && skipCompletes(alivePlayers(context.players), context.skipVotes, event.playerId),
    // 악 토론 skip 완주: 악 진영 생존자 전원
    allEvilSkipComplete: ({ context, event }) =>
      event.type === 'SKIP' &&
      skipCompletes(
        alivePlayers(context.players).filter((p) => p.faction === 'EVIL'),
        context.skipVotes,
        event.playerId,
      ),

    /* ── 낮 ── */
    // 전이 조건: 자청비가 생존해 있고 사용할 수 있는 꽃이 하나라도 있음
    flowerPhaseAvailable: ({ context }) => {
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi');
      if (!jacheongbi?.alive) return false;
      const revivable =
        canUseSkill(jacheongbi, 'revival-flower') &&
        context.pendingDeaths.some((d) => d.cause === 'EVIL_NIGHT_KILL' && d.applied);
      const doomable = canUseSkill(jacheongbi, 'doom-flower');
      return revivable || doomable;
    },
    // 부활꽃 유효성: 그날 밤 악 진영 킬 사망자만 대상 (동반사망자·처형자 제외)
    validRevive: ({ context, event }) => {
      if (event.type !== 'FLOWER_REVIVE') return false;
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi');
      return (
        !!jacheongbi?.alive &&
        canUseSkill(jacheongbi, 'revival-flower') &&
        isRevivableTonight(context.pendingDeaths, event.targetId)
      );
    },
    // 멸망꽃 유효성: 생존자 1인 지정 (같은 아침 상호 배타는 상태 전이로 보장됨)
    validDoom: ({ context, event }) => {
      if (event.type !== 'FLOWER_DOOM') return false;
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi');
      const target = getPlayer(context.players, event.targetId);
      return !!jacheongbi?.alive && canUseSkill(jacheongbi, 'doom-flower') && !!target?.alive;
    },
    // 개인 발언 Skip: 현재 발언자 본인만 유효
    currentSpeakerSkip: ({ context, event }) =>
      event.type === 'SKIP' && context.speechQueue[0] === event.playerId,
    // 전이 조건: 마지막 발언자까지 끝남
    lastSpeech: ({ context }) => context.speechQueue.length <= 1,
    // 안전장치: 발언 큐가 완전히 비었음 (정상 플로우에서는 발생하지 않음)
    noSpeakers: ({ context }) => context.speechQueue.length === 0,
    // 전이 조건: 구미호가 전날 밤 유혹 사용 → 토론 후 투표 단계 전체 스킵
    seduceActive: ({ context }) => context.seduceNextDay,
    // 유효 처형 투표: 생존자가 생존자(또는 기권)에게
    validDayVote: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const voter = getPlayer(context.players, event.voterId);
      if (!voter?.alive) return false;
      if (event.targetId === 'ABSTAIN') return true;
      return !!getPlayer(context.players, event.targetId)?.alive;
    },
    // 유효 재투표: 대상이 동표 후보로 제한됨
    validDayRevote: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const voter = getPlayer(context.players, event.voterId);
      if (!voter?.alive) return false;
      if (event.targetId === 'ABSTAIN') return true;
      return context.tieCandidates.includes(event.targetId);
    },
    // 최후의 변론 Skip: 처형 대상자 본인만 유효
    condemnedSkip: ({ context, event }) =>
      event.type === 'SKIP' && context.executionTargetId === event.playerId,

    /* ── 밤 ── */
    validInvestigate: ({ context, event }) => {
      if (event.type !== 'HAETAE_INVESTIGATE') return false;
      const haetae = context.players.find((p) => p.characterId === 'haetae');
      const target = getPlayer(context.players, event.targetId);
      return !!haetae?.alive && !!target?.alive && target.id !== haetae.id;
    },
    validPrank: ({ context }) => {
      const dokkaebi = context.players.find((p) => p.characterId === 'dokkaebi');
      return !!dokkaebi?.alive && canUseSkill(dokkaebi, 'prank') && !context.prankUsedTonight;
    },
    validEvilVote: ({ context, event }) => {
      if (event.type !== 'EVIL_KILL_VOTE') return false;
      const voter = getPlayer(context.players, event.voterId);
      const target = getPlayer(context.players, event.targetId);
      return !!voter?.alive && voter.faction === 'EVIL' && !!target?.alive;
    },
    validCompanion: ({ context, event }) => {
      if (event.type !== 'JEOSEUNG_COMPANION') return false;
      const jeoseung = context.players.find((p) => p.characterId === 'jeoseung');
      const target = getPlayer(context.players, event.targetId);
      return (
        !!jeoseung?.alive &&
        canUseSkill(jeoseung, 'companion') &&
        !!target?.alive &&
        target.id !== jeoseung.id
      );
    },
    validSeduce: ({ context }) => {
      const gumiho = context.players.find((p) => p.characterId === 'gumiho');
      return !!gumiho?.alive && canUseSkill(gumiho, 'seduce') && !context.seduceNextDay;
    },

    /* ── 사망 처리 ── */
    // 전이 조건: 피 맺힌 유서 대상 선택 입력 대기
    awaitingGrudge: ({ context }) => context.awaiting?.kind === 'GRUDGE',
    // 전이 조건: 조언자 승계/파기 입력 대기
    awaitingSuccession: ({ context }) => context.awaiting?.kind === 'SUCCESSION',
    validGrudgeTarget: ({ context, event }) => {
      if (event.type !== 'GRUDGE_TARGET') return false;
      const target = getPlayer(context.players, event.targetId);
      return !!target?.alive;
    },
    validSuccession: ({ context, event }) => {
      if (event.type !== 'ADVISOR_SUCCEED') return false;
      const target = getPlayer(context.players, event.targetId);
      return !!target?.alive;
    },
    // 전이 조건: 사망 처리 종료 후 승리 조건 성립 (탈락 승리 — 일차 무관, 8번 섹션)
    gameWon: ({ context }) => checkWin(context.players) !== null,
    // 전이 조건: 사망 처리 종료 후 복귀 지점이 밤
    resumeToNight: ({ context }) => context.resumeAfterDeaths === 'NIGHT',
  },

  actions: {
    /* ── 조언자 선출 ── */
    addCandidate: assign(({ context, event }) => {
      if (event.type !== 'CANDIDACY_APPLY') return {};
      return { candidates: [...context.candidates, event.playerId] };
    }),
    initAppealQueue: assign(({ context }) => ({ appealQueue: [...context.candidates] })),
    shiftAppeal: assign(({ context }) => ({ appealQueue: context.appealQueue.slice(1) })),
    clearVotes: assign({ votes: {} }),
    registerVote: assign(({ context, event }) => {
      if (event.type !== 'VOTE') return {};
      return { votes: { ...context.votes, [event.voterId]: event.targetId } };
    }),
    // 최다 득표자를 조언자로 확정
    electAdvisor: assign(({ context }) => {
      const outcome = resolveVoteOutcome(context.votes);
      return outcome.kind === 'DECIDED' ? { advisorId: outcome.targetId, votes: {} } : {};
    }),
    // 재투표에서도 동표(또는 무득표) → 최다득표자/후보 중 무작위 선정 (7번 섹션)
    electAdvisorRandom: assign(({ context }) => {
      const outcome = resolveVoteOutcome(context.votes);
      const pool =
        outcome.kind === 'TIE'
          ? outcome.candidates
          : context.tieCandidates.length > 0
            ? context.tieCandidates
            : context.candidates;
      return { advisorId: pickRandom(pool, context.rng), votes: {} };
    }),
    setTieCandidates: assign(({ context }) => {
      const outcome = resolveVoteOutcome(context.votes);
      return outcome.kind === 'TIE' ? { tieCandidates: outcome.candidates, votes: {} } : {};
    }),
    // 조언자 없음 확정 → 발언 순서 정순 고정
    noAdvisor: assign({ advisorId: null, advisorBroken: true }),

    /* ── Skip 집계 (전체 토론 공용) ── */
    clearSkips: assign({ skipVotes: [] }),
    addSkipVote: assign(({ context, event }) => {
      if (event.type !== 'SKIP') return {};
      const p = getPlayer(context.players, event.playerId);
      if (!p?.alive || context.skipVotes.includes(event.playerId)) return {};
      return { skipVotes: [...context.skipVotes, event.playerId] };
    }),

    /* ── 낮 ── */
    setSpeechDirection: assign(({ event }) => {
      if (event.type !== 'ADVISOR_DIRECTION') return {};
      return { speechDirection: event.direction };
    }),
    // 매 아침 개인 발언 순서 재계산 — 조언자 마지막, 방향은 조언자 결정 (7번 섹션)
    initSpeechQueue: assign(({ context }) => ({
      speechQueue: computeSpeechOrder(
        context.players,
        context.advisorBroken ? null : context.advisorId,
        context.speechDirection,
      ),
      skipVotes: [],
    })),
    shiftSpeech: assign(({ context }) => ({ speechQueue: context.speechQueue.slice(1) })),
    // 부활꽃: 대상 부활 + 해당 사망 건 폐기(트리거 미발동), 스킬 소모
    applyRevive: assign(({ context, event }) => {
      if (event.type !== 'FLOWER_REVIVE') return {};
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi')!;
      const players = markSkillUsed(context.players, jacheongbi.id, 'revival-flower').map((p) =>
        p.id === event.targetId ? { ...p, alive: true } : p,
      );
      return {
        players,
        pendingDeaths: context.pendingDeaths.filter((d) => d.playerId !== event.targetId),
      };
    }),
    // 멸망꽃: 즉시 처형 건 적재 (도깨비 장난으로 방어 불가 — 밤 킬 경로가 아니므로 자연히 미적용)
    applyDoom: assign(({ context, event }) => {
      if (event.type !== 'FLOWER_DOOM') return {};
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi')!;
      return {
        players: markSkillUsed(context.players, jacheongbi.id, 'doom-flower'),
        pendingDeaths: [
          ...context.pendingDeaths,
          { playerId: event.targetId, cause: 'DOOM_FLOWER', applied: false } satisfies PendingDeath,
        ],
      };
    }),
    // 유혹 소모 — 투표 단계 스킵과 함께 1회성 효과 종료
    consumeSeduce: assign({ seduceNextDay: false }),
    setExecutionTarget: assign(({ context }) => {
      const outcome = resolveVoteOutcome(context.votes);
      return outcome.kind === 'DECIDED'
        ? { executionTargetId: outcome.targetId, votes: {}, tieCandidates: [] }
        : {};
    }),
    // 재투표에서도 동표 → 최다득표자 중 무작위 1인 처형 (5-4항)
    setExecutionTargetRandom: assign(({ context }) => {
      const outcome = resolveVoteOutcome(context.votes);
      const pool = outcome.kind === 'TIE' ? outcome.candidates : context.tieCandidates;
      return { executionTargetId: pickRandom(pool, context.rng), votes: {}, tieCandidates: [] };
    }),
    // 최후의 변론 종료 → 처형 사망 건 적재
    enqueueExecution: assign(({ context }) => {
      if (!context.executionTargetId) return {};
      return {
        pendingDeaths: [
          ...context.pendingDeaths,
          {
            playerId: context.executionTargetId,
            cause: 'DAY_EXECUTION',
            applied: false,
          } satisfies PendingDeath,
        ],
        executionTargetId: null,
      };
    }),

    /* ── 밤 ── */
    clearNightState: assign({ evilVotes: {}, lastInvestigation: null, skipVotes: [] }),
    recordInvestigation: assign(({ context, event }) => {
      if (event.type !== 'HAETAE_INVESTIGATE') return {};
      const target = getPlayer(context.players, event.targetId)!;
      return { lastInvestigation: { targetId: target.id, result: investigate(target) } };
    }),
    usePrank: assign(({ context }) => {
      const dokkaebi = context.players.find((p) => p.characterId === 'dokkaebi')!;
      return {
        players: markSkillUsed(context.players, dokkaebi.id, 'prank'),
        prankUsedTonight: true,
      };
    }),
    registerEvilVote: assign(({ context, event }) => {
      if (event.type !== 'EVIL_KILL_VOTE') return {};
      return { evilVotes: { ...context.evilVotes, [event.voterId]: event.targetId } };
    }),
    // 악 진영 처치 투표 집계 (동률 시 무작위 — 문서 미정 가정)
    decideNightKill: assign(({ context }) => ({
      nightKillTargetId: resolveNightKillTarget(context.evilVotes, context.rng),
    })),
    setCompanion: assign(({ context, event }) => {
      if (event.type !== 'JEOSEUNG_COMPANION') return {};
      const jeoseung = context.players.find((p) => p.characterId === 'jeoseung')!;
      return {
        players: markSkillUsed(context.players, jeoseung.id, 'companion'),
        companionTargetId: event.targetId,
      };
    }),
    useSeduce: assign(({ context }) => {
      const gumiho = context.players.find((p) => p.characterId === 'gumiho')!;
      return {
        players: markSkillUsed(context.players, gumiho.id, 'seduce'),
        seduceNextDay: true,
      };
    }),
    // 새벽 처리: 일차 증가, 연민 예약 부활, 밤 킬 판정(장난이면 무효)
    applyDawn: assign(({ context }) => {
      const result = processDawn({
        players: context.players,
        scheduledRevivals: context.scheduledRevivals,
        nightKillTargetId: context.nightKillTargetId,
        prankUsedTonight: context.prankUsedTonight,
      });
      return {
        day: context.day + 1,
        players: result.players,
        pendingDeaths: [...context.pendingDeaths, ...result.pendingDeaths],
        scheduledRevivals: result.scheduledRevivals,
        nightKillTargetId: null,
        prankUsedTonight: false,
        votes: {},
        tieCandidates: [],
      };
    }),

    /* ── 사망 처리 ── */
    setResumeDay: assign({ resumeAfterDeaths: 'DAY_DISCUSSION' }),
    setResumeNight: assign({ resumeAfterDeaths: 'NIGHT' }),
    // 사망 큐 처리 — 자동 트리거는 연쇄까지 소진, 입력 필요 시 awaiting 설정 후 중단
    runDeathQueue: assign(({ context }) => processDeathQueue(deathState(context))),
    // 피 맺힌 유서: 대상 동반 사망 적재 + 스킬 소모 + 현재 트리거 소진
    applyGrudge: assign(({ context, event }) => {
      if (event.type !== 'GRUDGE_TARGET' || !context.awaiting) return {};
      const ownerId = context.awaiting.playerId;
      const pendingDeaths = context.pendingDeaths.map((d, i) =>
        i === 0 ? { ...d, triggers: d.triggers?.slice(1) } : d,
      );
      return {
        players: markSkillUsed(context.players, ownerId, 'blood-grudge'),
        pendingDeaths: [
          ...pendingDeaths,
          { playerId: event.targetId, cause: 'TAKE_ALONG', applied: false } satisfies PendingDeath,
        ],
        awaiting: null,
      };
    }),
    // 피 맺힌 유서 포기 (버튼 또는 10초 만료)
    skipGrudge: assign(({ context }) => ({
      pendingDeaths: context.pendingDeaths.map((d, i) =>
        i === 0 ? { ...d, triggers: d.triggers?.slice(1) } : d,
      ),
      awaiting: null,
    })),
    // 방울 승계: 지목한 생존자가 조언자 역할 인계
    applySuccession: assign(({ context, event }) => {
      if (event.type !== 'ADVISOR_SUCCEED') return {};
      return {
        advisorId: event.targetId,
        pendingDeaths: context.pendingDeaths.map((d, i) =>
          i === 0 ? { ...d, triggers: d.triggers?.slice(1) } : d,
        ),
        awaiting: null,
      };
    }),
    // 방울 파기(또는 10초 미선택 자동 파기): 조언자 소멸 → 발언 순서 정순 고정
    applyDestroy: assign(({ context }) => ({
      advisorId: null,
      advisorBroken: true,
      pendingDeaths: context.pendingDeaths.map((d, i) =>
        i === 0 ? { ...d, triggers: d.triggers?.slice(1) } : d,
      ),
      awaiting: null,
    })),
    setWinner: assign(({ context }) => ({ winner: checkWin(context.players) })),
  },
}).createMachine({
  id: 'game',
  context: ({ input }) => ({
    players: input.players,
    day: 1,
    mode: input.mode ?? (input.players.length === 7 ? 7 : 9),
    roomSettings: input.settings ?? DEFAULT_ROOM_TIMER_SETTINGS,
    speechQueue: [],
    skipVotes: [],
    advisorId: null,
    advisorBroken: false,
    speechDirection: 'FORWARD',
    candidates: [],
    appealQueue: [],
    votes: {},
    tieCandidates: [],
    executionTargetId: null,
    evilVotes: {},
    nightKillTargetId: null,
    prankUsedTonight: false,
    seduceNextDay: false,
    companionTargetId: null,
    lastInvestigation: null,
    pendingDeaths: [],
    awaiting: null,
    resumeAfterDeaths: 'DAY_DISCUSSION',
    scheduledRevivals: [],
    winner: null,
    rng: input.rng ?? Math.random,
  }),
  initial: 'setup',

  states: {
    /* ═══ 시작 분기 ═══ */
    setup: {
      always: [
        // 전이 조건: 7인 모드 — 조언자 뽑기 제외, 바로 첫날 낮 개인 발언 (정순 고정)
        { guard: 'electionDisabled', actions: 'noAdvisor', target: '#daySpeech' },
        // 전이 조건: 9인 모드 — 첫날 아침 조언자 선출부터
        { target: 'firstMorning' },
      ],
    },

    /* ═══ 첫날 아침 — 조언자 선출 (requirements 7번) ═══ */
    firstMorning: {
      initial: 'candidacy',
      states: {
        // 출마 신청 (7초)
        candidacy: {
          on: {
            CANDIDACY_APPLY: { guard: 'validCandidacy', actions: 'addCandidate' },
            TIME_UP: [
              // 전이 조건: 출마자 없음 → 조언자 없이 첫날 낮으로 (발언 순서 정순 고정 — 문서 미정 가정)
              { guard: 'noCandidates', actions: 'noAdvisor', target: '#daySpeech' },
              // 전이 조건: 출마자 있음 → 개인 어필 발언으로
              { actions: 'initAppealQueue', target: 'appeal' },
            ],
          },
        },
        // 출마자 개인 어필 발언 (각 20초) — Skip은 현재 발언자 본인만
        appeal: {
          on: {
            TIME_UP: [
              // 전이 조건: 마지막 발언자까지 끝남 → 전체 토론
              { guard: 'lastAppeal', actions: 'shiftAppeal', target: 'electionDiscussion' },
              // 전이 조건: 다음 발언자 남음 (내부 전이 — 발언자 교체)
              { actions: 'shiftAppeal' },
            ],
            SKIP: [
              {
                guard: and(['currentAppealSpeakerSkip', 'lastAppeal']),
                actions: 'shiftAppeal',
                target: 'electionDiscussion',
              },
              { guard: 'currentAppealSpeakerSkip', actions: 'shiftAppeal' },
            ],
          },
        },
        // 조언자 선출 전체 토론 (50초) — 생존자 전원 Skip 시 조기 종료
        electionDiscussion: {
          entry: 'clearSkips',
          on: {
            TIME_UP: { target: 'electionVote' },
            SKIP: [
              { guard: 'allAliveSkipComplete', target: 'electionVote' },
              { actions: 'addSkipVote' },
            ],
          },
        },
        // 조언자 선출 투표 (7초) — 출마자는 투표권 없음
        electionVote: {
          entry: 'clearVotes',
          on: {
            VOTE: { guard: 'validElectionVote', actions: 'registerVote' },
            TIME_UP: [
              // 전이 조건: 최다 득표자 단독 → 조언자 확정 후 첫날 낮 개인 발언
              { guard: 'voteDecided', actions: 'electAdvisor', target: '#daySpeech' },
              // 전이 조건: 무득표 → 후보 중 무작위 선정 (문서 미정 가정)
              { guard: 'voteNoTarget', actions: 'electAdvisorRandom', target: '#daySpeech' },
              // 전이 조건: 동표 → 동표자만 후보로 재투표
              { actions: 'setTieCandidates', target: 'electionRevote' },
            ],
          },
        },
        // 선출 재투표 — 재투표에서도 동표면 무작위 선정 (7번 섹션)
        electionRevote: {
          on: {
            VOTE: { guard: 'validElectionRevote', actions: 'registerVote' },
            TIME_UP: [
              { guard: 'voteDecided', actions: 'electAdvisor', target: '#daySpeech' },
              { actions: 'electAdvisorRandom', target: '#daySpeech' },
            ],
          },
        },
      },
    },

    /* ═══ 낮 페이즈 (requirements 5번·7번 발언 순서) ═══ */
    day: {
      initial: 'dawn',
      states: {
        // 새벽 통과 상태: 일차 증가 → 연민 부활 → 밤 킬 판정(장난이면 "사망자 없음")
        dawn: {
          id: 'dawn',
          entry: 'applyDawn',
          always: [
            // 전이 조건: 자청비 생존 + 사용 가능한 꽃 있음 → 꽃 선택 (10초)
            { guard: 'flowerPhaseAvailable', target: 'flowerDecision' },
            // 전이 조건: 꽃 단계 불가 → 밤 사망자 트리거 처리 후 낮 진행
            { actions: 'setResumeDay', target: '#resolveDeaths' },
          ],
        },
        // 자청비 부활꽃/멸망꽃 선택 (10초) — 같은 아침 두 꽃 동시 사용 불가(전이가 1회로 보장)
        flowerDecision: {
          on: {
            // 조언자: 이 아침의 발언 방향(역순/정순) 결정 — 개인 발언 시작 전까지 유효
            ADVISOR_DIRECTION: { actions: 'setSpeechDirection' },
            // 부활꽃: 그날 밤 악 진영 킬 사망자만 부활 → 남은 사망 트리거 처리
            FLOWER_REVIVE: {
              guard: 'validRevive',
              actions: ['applyRevive', 'setResumeDay'],
              target: '#resolveDeaths',
            },
            // 멸망꽃: 생존자 1인 즉시 처형 (동귀어진류 봉인은 sealedByDeathCauses로 처리)
            FLOWER_DOOM: {
              guard: 'validDoom',
              actions: ['applyDoom', 'setResumeDay'],
              target: '#resolveDeaths',
            },
            FLOWER_PASS: { actions: 'setResumeDay', target: '#resolveDeaths' },
            TIME_UP: { actions: 'setResumeDay', target: '#resolveDeaths' },
          },
        },
        // 낮 개인 발언 — 방 옵션(80/120초)씩 순서대로, 조언자는 마지막 (7번 섹션)
        // Skip은 현재 발언자 본인만 유효 → 즉시 다음 순서
        personalSpeech: {
          id: 'daySpeech',
          entry: 'initSpeechQueue',
          always: [
            // 안전장치: 발언자가 아무도 없으면 곧장 전체 토론으로 (매 이벤트 후 재평가되므로 빈 큐만 대상)
            { guard: 'noSpeakers', target: 'discussion' },
          ],
          on: {
            TIME_UP: [
              // 전이 조건: 마지막 발언자 종료 → 전체 토론
              { guard: 'lastSpeech', actions: 'shiftSpeech', target: 'discussion' },
              // 전이 조건: 다음 발언자 남음 (내부 전이 — 발언자 교체, 타이머 재시작은 세션 담당)
              { actions: 'shiftSpeech' },
            ],
            SKIP: [
              {
                guard: and(['currentSpeakerSkip', 'lastSpeech']),
                actions: 'shiftSpeech',
                target: 'discussion',
              },
              { guard: 'currentSpeakerSkip', actions: 'shiftSpeech' },
            ],
          },
        },
        // 낮 전체 토론 (방 옵션 3분/5분) — 생존자 전원 Skip 시 조기 종료 → 투표
        discussion: {
          id: 'dayDiscussion',
          entry: 'clearSkips',
          on: {
            TIME_UP: [
              // 전이 조건: 구미호가 전날 밤 유혹 사용 → 투표 단계 전체 스킵, 바로 밤 (5-2항)
              { guard: 'seduceActive', actions: 'consumeSeduce', target: '#night' },
              { target: 'vote' },
            ],
            SKIP: [
              // 전이 조건: 생존자 전원 skip — TIME_UP과 동일하게 유혹 분기 적용
              {
                guard: and(['allAliveSkipComplete', 'seduceActive']),
                actions: 'consumeSeduce',
                target: '#night',
              },
              { guard: 'allAliveSkipComplete', target: 'vote' },
              { actions: 'addSkipVote' },
            ],
          },
        },
        // 처형 투표 (10초, 기권 포함)
        vote: {
          entry: 'clearVotes',
          on: {
            VOTE: { guard: 'validDayVote', actions: 'registerVote' },
            TIME_UP: [
              // 전이 조건: 전원 기권(득표자 없음) → 희생자 없이 밤으로 (5-4항 기권 규칙)
              { guard: 'voteNoTarget', target: '#night' },
              // 전이 조건: 최다 득표 단독 → 최후의 변론
              { guard: 'voteDecided', actions: 'setExecutionTarget', target: 'finalPlea' },
              // 전이 조건: 동표 → 최다득표자 동시 발언 20초
              { actions: 'setTieCandidates', target: 'tieSpeech' },
            ],
          },
        },
        // 동표 시 최다득표자 동시 발언 (20초) — Skip 없음 (동시 발언이므로)
        tieSpeech: {
          on: {
            TIME_UP: { target: 'revote' },
          },
        },
        // 재투표 — 재투표에서도 동표면 최다득표자 중 무작위 1인 처형 (5-4항)
        revote: {
          entry: 'clearVotes',
          on: {
            VOTE: { guard: 'validDayRevote', actions: 'registerVote' },
            TIME_UP: [
              { guard: 'voteDecided', actions: 'setExecutionTarget', target: 'finalPlea' },
              // 동표·전원 기권 모두 동표 후보 중 무작위 처형으로 수렴
              { actions: 'setExecutionTargetRandom', target: 'finalPlea' },
            ],
          },
        },
        // 최후의 변론 (20초) — 처형 대상자만 발언, 본인 Skip으로 즉시 사망 처리
        finalPlea: {
          on: {
            TIME_UP: { actions: ['enqueueExecution', 'setResumeNight'], target: '#resolveDeaths' },
            SKIP: {
              guard: 'condemnedSkip',
              actions: ['enqueueExecution', 'setResumeNight'],
              target: '#resolveDeaths',
            },
          },
        },
      },
    },

    /* ═══ 밤 페이즈 (requirements 4번) ═══ */
    night: {
      id: 'night',
      initial: 'goodSkills',
      states: {
        // 1) 해태/도깨비 스킬 (10초, 동시 진행)
        goodSkills: {
          entry: 'clearNightState',
          on: {
            HAETAE_INVESTIGATE: { guard: 'validInvestigate', actions: 'recordInvestigation' },
            DOKKAEBI_PRANK: { guard: 'validPrank', actions: 'usePrank' },
            TIME_UP: { target: 'evilDiscussion' },
          },
        },
        // 2) 악 진영 토론 (90초) — 악 생존자 전원 Skip 시 조기 종료
        evilDiscussion: {
          entry: 'clearSkips',
          on: {
            TIME_UP: { target: 'evilVote' },
            SKIP: [
              { guard: 'allEvilSkipComplete', target: 'evilVote' },
              { actions: 'addSkipVote' },
            ],
          },
        },
        // 3) 악 진영 처치 대상 투표 (10초) — 동률 시 무작위(문서 미정 가정), 무투표면 킬 없음
        evilVote: {
          on: {
            EVIL_KILL_VOTE: { guard: 'validEvilVote', actions: 'registerEvilVote' },
            TIME_UP: { actions: 'decideNightKill', target: 'evilSkills' },
          },
        },
        // 5) 악 진영 개별 스킬 (10초) — 저승사자 길동무 / 구미호 유혹, 깡철이는 패시브
        //    (4항 도깨비 장난의 킬 무효 판정은 새벽(dawn)에서 처리)
        evilSkills: {
          on: {
            JEOSEUNG_COMPANION: { guard: 'validCompanion', actions: 'setCompanion' },
            GUMIHO_SEDUCE: { guard: 'validSeduce', actions: 'useSeduce' },
            TIME_UP: { target: '#dawn' },
          },
        },
      },
    },

    /* ═══ 사망 확정 트리거 공통 처리 (requirements 5-6항) ═══ */
    resolveDeaths: {
      id: 'resolveDeaths',
      initial: 'advance',
      states: {
        // 큐 처리 — 자동 트리거(동반 사망·부활 예약)는 연쇄까지 즉시, 입력형은 대기 상태로 분기
        advance: {
          entry: 'runDeathQueue',
          always: [
            // 전이 조건: 피 맺힌 유서 대상 선택 대기 (10초, 멸망꽃 사망이면 트리거 자체가 없음)
            { guard: 'awaitingGrudge', target: 'awaitGrudge' },
            // 전이 조건: 조언자 방울 승계/파기 대기 (10초)
            { guard: 'awaitingSuccession', target: 'awaitSuccession' },
            // 전이 조건: 큐 소진 + 탈락 승리 성립 → 게임 종료 (일차 무관, 8번 섹션)
            { guard: 'gameWon', actions: 'setWinner', target: '#gameOver' },
            // 전이 조건: 큐 소진 + 복귀 지점 = 밤
            { guard: 'resumeToNight', target: '#night' },
            // 전이 조건: 큐 소진 + 복귀 지점 = 낮 (개인 발언부터)
            { target: '#daySpeech' },
          ],
        },
        // 장화홍련: 피 맺힌 유서 — 1인 지목 동반 사망, 10초 미선택/포기 시 미발동
        awaitGrudge: {
          on: {
            GRUDGE_TARGET: {
              guard: 'validGrudgeTarget',
              actions: 'applyGrudge',
              target: 'advance',
              reenter: true,
            },
            GRUDGE_FORGO: { actions: 'skipGrudge', target: 'advance', reenter: true },
            TIME_UP: { actions: 'skipGrudge', target: 'advance', reenter: true },
          },
        },
        // 조언자: 방울 승계 지목 / 파기 — 10초 미선택 시 자동 파기
        awaitSuccession: {
          on: {
            ADVISOR_SUCCEED: {
              guard: 'validSuccession',
              actions: 'applySuccession',
              target: 'advance',
              reenter: true,
            },
            ADVISOR_DESTROY: { actions: 'applyDestroy', target: 'advance', reenter: true },
            TIME_UP: { actions: 'applyDestroy', target: 'advance', reenter: true },
          },
        },
      },
    },

    /* ═══ 게임 종료 (requirements 8번) ═══ */
    gameOver: {
      id: 'gameOver',
      type: 'final',
    },
  },
});

export type GameMachine = typeof gameMachine;
