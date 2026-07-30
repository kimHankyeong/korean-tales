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
 *   setup → night(밤 0, 전 모드 공통) → firstMorning(조언자 선출, 9인 모드만) → day ⇄ night 반복 → gameOver
 *   게임은 항상 밤부터 시작한다(4번 섹션). 9인 모드는 그 첫 밤이 끝난 뒤에만 조언자 선출로
 *   진입하고(firstMorningPending), 이후의 모든 밤은 평소처럼 낮 개인 발언으로 돌아간다.
 *   사망 발생 시 공통적으로 resolveDeaths 서브 상태를 경유한다.
 *
 * 밤(night) 내부 순서 — 13번 피드백(악 진영 우선) + 자청비 타이밍 통합 피드백 반영:
 *   evilDiscussion(악 토론) → evilVote(악 처치 투표 — 여기서 nightKillTargetId 확정)
 *   → evilSkills(구미호·저승사자) → goodSkills(도깨비·해태·**자청비** 동시 진행)
 *   → dawn(도깨비 보호 + 자청비 부활꽃을 한꺼번에 반영해 사망 판정) → resolveDeaths
 *   → firstMorning 또는 day.personalSpeech.
 *   자청비는 goodSkills 시점에 이미 확정된 nightKillTargetId(그날 밤 킬 대상)만을 부활꽃 후보로
 *   고른다 — 이 시점엔 도깨비가 그 대상을 보호할지 아직 알 수 없으므로 도깨비 스킬과 "겹칠 수
 *   있음"을 감수한 blind 선택이다(둘 다 같은 대상에 쓰이면 새벽 판정에서 둘 다 소모 처리).
 */

import { and, assign, setup } from 'xstate';
import { ADVISOR_ELECTION_BY_MODE, DEFAULT_ROOM_TIMER_SETTINGS } from '@korean-tales/shared';
import {
  alivePlayers,
  canUseSkill,
  canVoteInElection,
  checkWin,
  computeSpeechOrder,
  getPlayer,
  investigate,
  markSkillUsed,
  pickRandom,
  processDawn,
  processDeathQueue,
  resolveElectionVote,
  resolveExecutionVote,
  resolveNightKillTarget,
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
    deathAnnouncement: context.deathAnnouncement,
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
    // 전이 조건: 9인 모드의 첫 밤(밤 0)이 막 끝남 → 조언자 선출로 진입 (그 이후 밤은 해당 없음)
    firstMorningPending: ({ context }) => context.firstMorningPending,

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
      return (
        canVoteInElection(context.players, event.voterId, context.candidates) &&
        event.targetId !== 'ABSTAIN' &&
        context.candidates.includes(event.targetId)
      );
    },
    // 유효 선출 재투표: 후보가 동표자로 제한됨
    validElectionRevote: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      return (
        canVoteInElection(context.players, event.voterId, context.candidates) &&
        event.targetId !== 'ABSTAIN' &&
        context.tieCandidates.includes(event.targetId)
      );
    },
    // 전이 조건: 1차 선출 투표가 확정됨 (단독 최다 또는 무득표 무작위 — 동표 재투표만 아님)
    electionSettled: ({ context }) =>
      resolveElectionVote(context.votes, 1, { candidates: context.candidates }).kind !== 'REVOTE',
    // 전이 조건: 처형 투표 전원 기권 → 희생자 없이 밤으로 (5-4항 기권 규칙)
    execNoExecution: ({ context }) =>
      resolveExecutionVote(context.votes, 1).kind === 'NO_EXECUTION',
    // 전이 조건: 처형 투표 최다 득표 단독 확정
    execDecided: ({ context }) => resolveExecutionVote(context.votes, 1).kind === 'EXECUTE',
    // 생존자 전원이 투표를 마쳤는지 — 이 투표까지 반영한 가상의 집계로 판정(타이머를
    // 기다리지 않고 즉시 결과 공개로 넘어가기 위함). 실제 반영은 registerVote가 별도로 한다
    allAliveVotedNoExecution: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const merged = { ...context.votes, [event.voterId]: event.targetId };
      if (!alivePlayers(context.players).every((p) => p.id in merged)) return false;
      return resolveExecutionVote(merged, 1).kind === 'NO_EXECUTION';
    },
    allAliveVotedExecDecided: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const merged = { ...context.votes, [event.voterId]: event.targetId };
      if (!alivePlayers(context.players).every((p) => p.id in merged)) return false;
      return resolveExecutionVote(merged, 1).kind === 'EXECUTE';
    },
    allAliveVotedTie: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const merged = { ...context.votes, [event.voterId]: event.targetId };
      if (!alivePlayers(context.players).every((p) => p.id in merged)) return false;
      const kind = resolveExecutionVote(merged, 1).kind;
      return kind !== 'NO_EXECUTION' && kind !== 'EXECUTE';
    },
    // 재투표: 생존자 전원이 투표를 마쳤는지 (재투표는 기권 규칙 없이 항상 처형으로 귀결)
    allAliveRevoted: ({ context, event }) => {
      if (event.type !== 'VOTE') return false;
      const merged = { ...context.votes, [event.voterId]: event.targetId };
      return alivePlayers(context.players).every((p) => p.id in merged);
    },
    // voteReveal(투표 결과 공개) 종료 후 어디로 갈지 — postVoteTarget에 저장해둔 값을 읽는다
    postVoteTargetIsNight: ({ context }) => context.postVoteTarget === 'NIGHT',
    postVoteTargetIsFinalPlea: ({ context }) => context.postVoteTarget === 'FINAL_PLEA',
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
    // 부활꽃 유효성: 그날 밤 악 진영의 킬 대상(nightKillTargetId)만 후보 — 도깨비 보호 여부는 새벽에
    // 판정되므로 이 시점엔 알 수 없다. 같은 밤 멸망꽃을 이미 썼다면 중복 사용 불가
    validRevive: ({ context, event }) => {
      if (event.type !== 'FLOWER_REVIVE') return false;
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi');
      return (
        !!jacheongbi?.alive &&
        canUseSkill(jacheongbi, 'revival-flower') &&
        !context.doomUsedTonight &&
        context.nightKillTargetId !== null &&
        event.targetId === context.nightKillTargetId
      );
    },
    // 멸망꽃 유효성: 생존자 1인 지정. 같은 밤 부활꽃을 이미 썼다면 중복 사용 불가
    validDoom: ({ context, event }) => {
      if (event.type !== 'FLOWER_DOOM') return false;
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi');
      const target = getPlayer(context.players, event.targetId);
      return (
        !!jacheongbi?.alive &&
        canUseSkill(jacheongbi, 'doom-flower') &&
        context.reviveTargetId === null &&
        !!target?.alive
      );
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
      if (context.lastInvestigation !== null) return false; // 밤당 1회 — 이미 조사했으면 재조사 불가
      const haetae = context.players.find((p) => p.characterId === 'haetae');
      const target = getPlayer(context.players, event.targetId);
      return !!haetae?.alive && !!target?.alive && target.id !== haetae.id;
    },
    validPrank: ({ context, event }) => {
      if (event.type !== 'DOKKAEBI_PRANK') return false;
      const dokkaebi = context.players.find((p) => p.characterId === 'dokkaebi');
      const target = getPlayer(context.players, event.targetId);
      return !!dokkaebi?.alive && canUseSkill(dokkaebi, 'prank') && !!target?.alive;
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
    // 투항은 선/악 팀만 가능 (중립 제외) — 30초 팀 동의 집계는 Room 레이어가 담당
    validSurrender: ({ event }) =>
      event.type === 'TEAM_SURRENDER' && (event.faction === 'EVIL' || event.faction === 'GOOD'),
    // 도중에 나가기: 대상이 아직 생존해 있어야 함(중복 요청 방지)
    validForfeit: ({ context, event }) => {
      if (event.type !== 'FORFEIT') return false;
      return !!getPlayer(context.players, event.playerId)?.alive;
    },
    // 이탈로 즉시 승리 조건이 성립하는지 — 실제 반영 전 가정 계산(탈락 승리, 8번 섹션)
    forfeitEndsGame: ({ context, event }) => {
      if (event.type !== 'FORFEIT') return false;
      const players = context.players.map((p) =>
        p.id === event.playerId ? { ...p, alive: false } : p,
      );
      return checkWin(players) !== null;
    },
  },

  actions: {
    /* ── 조언자 선출 ── */
    addCandidate: assign(({ context, event }) => {
      if (event.type !== 'CANDIDACY_APPLY') return {};
      return { candidates: [...context.candidates, event.playerId] };
    }),
    // 어필 발언 순서: 출마자 중 배정 번호 오름차순(앞 번호부터 정순, 7번 섹션)
    initAppealQueue: assign(({ context }) => ({
      appealQueue: [...context.candidates].sort(
        (a, b) => (getPlayer(context.players, a)?.seat ?? 0) - (getPlayer(context.players, b)?.seat ?? 0),
      ),
    })),
    shiftAppeal: assign(({ context }) => ({ appealQueue: context.appealQueue.slice(1) })),
    clearVotes: assign({ votes: {} }),
    registerVote: assign(({ context, event }) => {
      if (event.type !== 'VOTE') return {};
      return { votes: { ...context.votes, [event.voterId]: event.targetId } };
    }),
    // 처형 투표(또는 재투표) 종료 순간의 스냅샷 — 결과를 지우기 직전에 호출해야 한다(9번 피드백)
    snapshotVoteResult: assign(({ context }) => ({ lastVoteResult: { ...context.votes } })),
    // voteReveal 종료 후 목적지 지정 — vote/revote의 TIME_UP 분기마다 하나씩 호출된다
    setPostVoteTargetNight: assign({ postVoteTarget: 'NIGHT' as const }),
    setPostVoteTargetFinalPlea: assign({ postVoteTarget: 'FINAL_PLEA' as const }),
    setPostVoteTargetTieSpeech: assign({ postVoteTarget: 'TIE_SPEECH' as const }),
    // 1차 선출 결과 적용 — 단독 최다면 확정, 무득표면 후보 중 무작위 (동표는 guard가 재투표로 분기)
    applyElectionRound1: assign(({ context }) => {
      const result = resolveElectionVote(context.votes, 1, { candidates: context.candidates });
      if (result.kind === 'REVOTE') return {};
      return {
        advisorId:
          result.kind === 'ELECTED' ? result.advisorId : pickRandom(result.pool, context.rng),
        votes: {},
      };
    }),
    // 선출 재투표 결과 적용 — 재동표·무득표는 동표 후보 중 무작위 선정 (7번 섹션)
    applyElectionRound2: assign(({ context }) => {
      const result = resolveElectionVote(context.votes, 2, {
        candidates: context.candidates,
        tieCandidates: context.tieCandidates,
      });
      if (result.kind === 'REVOTE') return {}; // 2차에서는 발생하지 않음
      return {
        advisorId:
          result.kind === 'ELECTED' ? result.advisorId : pickRandom(result.pool, context.rng),
        votes: {},
        tieCandidates: [],
      };
    }),
    // 1차 선출 동표 → 동표자만 후보로 재투표 준비
    setTieCandidatesFromElection: assign(({ context }) => {
      const result = resolveElectionVote(context.votes, 1, { candidates: context.candidates });
      return result.kind === 'REVOTE' ? { tieCandidates: result.candidates, votes: {} } : {};
    }),
    // 조언자 없음 확정 → 발언 순서 정순 고정
    noAdvisor: assign({ advisorId: null, advisorBroken: true }),
    // 밤 0 종료 후 조언자 선출로 1회만 진입 — 이후 밤에는 다시 트리거되지 않는다
    consumeFirstMorningPending: assign({ firstMorningPending: false }),

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
    // 부활꽃: 대상만 기록 — 도깨비 보호 결과를 아직 모르므로 실제 반영·스킬 소모는
    // 새벽(processDawn)에서 도깨비 보호와 함께 일괄 처리한다 (setDokkaebiProtection과 동일 패턴)
    setRevive: assign(({ event }) => {
      if (event.type !== 'FLOWER_REVIVE') return {};
      return { reviveTargetId: event.targetId };
    }),
    // 멸망꽃: 즉시 처형 건 적재 (도깨비 장난으로 방어 불가 — 밤 킬 경로가 아니므로 자연히 미적용)
    applyDoom: assign(({ context, event }) => {
      if (event.type !== 'FLOWER_DOOM') return {};
      const jacheongbi = context.players.find((p) => p.characterId === 'jacheongbi')!;
      return {
        players: markSkillUsed(context.players, jacheongbi.id, 'doom-flower'),
        doomUsedTonight: true,
        pendingDeaths: [
          ...context.pendingDeaths,
          { playerId: event.targetId, cause: 'DOOM_FLOWER', applied: false } satisfies PendingDeath,
        ],
      };
    }),
    // 유혹 소모 — 투표 단계 스킵과 함께 1회성 효과 종료
    // 유혹으로 낮 투표가 통째로 스킵될 때 공개 발표(3초) — 13번
    consumeSeduce: assign({
      seduceNextDay: false,
      deathAnnouncement: { text: '구미호에 홀려 아무도 투표를 할 수 없게 되었다', durationMs: 3000 },
    }),
    // 1차 처형 투표 확정 적용 (기권 규칙·동표는 guard가 분기)
    applyExecutionRound1: assign(({ context }) => {
      const result = resolveExecutionVote(context.votes, 1);
      return result.kind === 'EXECUTE'
        ? { executionTargetId: result.targetId, votes: {}, tieCandidates: [] }
        : {};
    }),
    // 처형 재투표 적용 — 재동표(·전원 기권)는 동표 후보 중 무작위 1인 처형 (5-4항)
    applyExecutionRound2: assign(({ context }) => {
      const result = resolveExecutionVote(context.votes, 2, context.tieCandidates);
      if (result.kind === 'EXECUTE')
        return { executionTargetId: result.targetId, votes: {}, tieCandidates: [] };
      if (result.kind === 'EXECUTE_RANDOM')
        return {
          executionTargetId: pickRandom(result.pool, context.rng),
          votes: {},
          tieCandidates: [],
        };
      return {};
    }),
    // 1차 처형 동표 → 최다득표자 동시 발언 준비
    setTieCandidatesFromExecution: assign(({ context }) => {
      const result = resolveExecutionVote(context.votes, 1);
      return result.kind === 'TIE_SPEECH' ? { tieCandidates: result.candidates, votes: {} } : {};
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
    // nightStartAlive: 이번 밤 시작 시점의 생존 스냅샷 — publicState.ts가 밤 사망 조기 노출을
    // 막는 데 쓴다(4-c 피드백)
    clearNightState: assign(({ context }) => ({
      evilVotes: {},
      lastInvestigation: null,
      skipVotes: [],
      dokkaebiProtectTargetId: null,
      reviveTargetId: null,
      doomUsedTonight: false,
      nightStartAlive: Object.fromEntries(context.players.map((p) => [p.id, p.alive])),
    })),
    recordInvestigation: assign(({ context, event }) => {
      if (event.type !== 'HAETAE_INVESTIGATE') return {};
      const target = getPlayer(context.players, event.targetId)!;
      return { lastInvestigation: { targetId: target.id, result: investigate(target) } };
    }),
    // 보호 대상만 기록 — 실제 스킬 소모는 새벽에 보호 성공 여부가 확정된 뒤 처리(processDawn)
    setDokkaebiProtection: assign(({ event }) => {
      if (event.type !== 'DOKKAEBI_PRANK') return {};
      return { dokkaebiProtectTargetId: event.targetId };
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
    // 새벽 처리: 일차 증가, 연민 예약 부활, 밤 킬 판정(도깨비 보호·자청비 부활꽃 중 하나라도
    // 성공하면 무효 + 해당 스킬 영구 소모. 둘 다 성공(같은 대상)이면 둘 다 소모)
    applyDawn: assign(({ context }) => {
      const result = processDawn({
        players: context.players,
        scheduledRevivals: context.scheduledRevivals,
        nightKillTargetId: context.nightKillTargetId,
        dokkaebiProtectTargetId: context.dokkaebiProtectTargetId,
        reviveTargetId: context.reviveTargetId,
      });
      return {
        day: context.day + 1,
        players: result.players,
        pendingDeaths: [...context.pendingDeaths, ...result.pendingDeaths],
        scheduledRevivals: result.scheduledRevivals,
        nightKillTargetId: null,
        dokkaebiProtectTargetId: null,
        reviveTargetId: null,
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
      const target = getPlayer(context.players, event.targetId);
      return {
        players: markSkillUsed(context.players, ownerId, 'blood-grudge'),
        pendingDeaths: [
          ...pendingDeaths,
          { playerId: event.targetId, cause: 'TAKE_ALONG', applied: false } satisfies PendingDeath,
        ],
        awaiting: null,
        deathAnnouncement: target
          ? { text: `유서에 쓰인 건 ${target.seat}번입니다`, durationMs: 4000 }
          : context.deathAnnouncement,
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
    // 투항 승리: 항복한 팀의 상대 진영이 승리 (8번 섹션 — 일차 무관)
    setSurrenderWinner: assign(({ event }) => {
      if (event.type !== 'TEAM_SURRENDER') return {};
      return { winner: (event.faction === 'EVIL' ? 'GOOD' : 'EVIL') as 'GOOD' | 'EVIL' };
    }),
    /**
     * 도중에 나가기 — 즉시 사망 처리하되, 이는 "사망"이 아니라 "이탈"이므로 길동무·유서 같은
     * 동반 사망 트리거는 발동하지 않는다(사망 트리거 큐를 거치지 않고 직접 alive만 뒤집는다).
     * 아직 소비되지 않은 발언 순서열에서도 제거해, 나중에 죽은 사람 차례가 와서 게임이
     * 멈추지 않게 한다. 조언자였다면 승계 절차 없이 즉시 파기(정순 고정)로 처리한다.
     */
    applyForfeit: assign(({ context, event }) => {
      if (event.type !== 'FORFEIT') return {};
      const players = context.players.map((p) =>
        p.id === event.playerId ? { ...p, alive: false } : p,
      );
      const wasAdvisor = context.advisorId === event.playerId;
      return {
        players,
        winner: checkWin(players),
        speechQueue: context.speechQueue.filter((id) => id !== event.playerId),
        appealQueue: context.appealQueue.filter((id) => id !== event.playerId),
        candidates: context.candidates.filter((id) => id !== event.playerId),
        tieCandidates: context.tieCandidates.filter((id) => id !== event.playerId),
        ...(wasAdvisor ? { advisorId: null, advisorBroken: true } : {}),
      };
    }),
  },
}).createMachine({
  id: 'game',
  context: ({ input }) => {
    const mode = input.mode ?? (input.players.length === 7 ? 7 : 9);
    return {
      players: input.players,
      // 밤 0(첫 밤) 종료 시 새벽 처리가 +1 하므로 0에서 시작 — 첫 실제 낮이 day:1이 된다
      day: 0,
      mode,
      roomSettings: input.settings ?? DEFAULT_ROOM_TIMER_SETTINGS,
      speechQueue: [],
      skipVotes: [],
      firstMorningPending: ADVISOR_ELECTION_BY_MODE[mode],
      advisorId: null,
      advisorBroken: false,
      speechDirection: 'FORWARD',
      candidates: [],
      appealQueue: [],
      votes: {},
      tieCandidates: [],
      executionTargetId: null,
      lastVoteResult: null,
      postVoteTarget: null,
      evilVotes: {},
      nightKillTargetId: null,
      dokkaebiProtectTargetId: null,
      reviveTargetId: null,
      doomUsedTonight: false,
      nightStartAlive: Object.fromEntries(input.players.map((p) => [p.id, p.alive])),
      seduceNextDay: false,
      companionTargetId: null,
      lastInvestigation: null,
      pendingDeaths: [],
      awaiting: null,
      resumeAfterDeaths: 'DAY_DISCUSSION',
      scheduledRevivals: [],
      deathAnnouncement: null,
      winner: null,
      rng: input.rng ?? Math.random,
    };
  },
  initial: 'setup',

  on: {
    // 전이 조건: 팀 전원 투항 확정(Room 레이어 30초 동의 완료) → 어느 상태에서든 즉시 게임 종료
    TEAM_SURRENDER: { guard: 'validSurrender', actions: 'setSurrenderWinner', target: '#gameOver' },
    // 도중에 나가기 — 어느 상태에서든 즉시 반영. 이로 인해 승리 조건이 성립하면 게임 종료,
    // 아니면 현재 진행 중이던 페이즈는 그대로 유지한 채(내부 전이) 계속 진행된다
    FORFEIT: [
      {
        guard: and(['validForfeit', 'forfeitEndsGame']),
        actions: 'applyForfeit',
        target: '#gameOver',
      },
      { guard: 'validForfeit', actions: 'applyForfeit' },
    ],
  },

  states: {
    /* ═══ 시작 분기 — 게임은 항상 밤(밤 0)부터 시작한다 ═══ */
    setup: {
      always: [
        // 전이 조건: 7인 모드 — 조언자 뽑기 제외 (발언 순서 정순 고정), 밤 0부터 시작
        { guard: 'electionDisabled', actions: 'noAdvisor', target: '#night' },
        // 전이 조건: 9인 모드 — 밤 0이 끝나면 조언자 선출로(firstMorningPending 가드가 처리)
        { target: '#night' },
      ],
    },

    /* ═══ 첫날 아침 — 조언자 선출 (requirements 7번) ═══ */
    firstMorning: {
      id: 'firstMorning',
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
              // 전이 조건: 1차 선출 확정 (단독 최다 또는 무득표 무작위) → 발언 방향 선택
              { guard: 'electionSettled', actions: 'applyElectionRound1', target: 'directionChoice' },
              // 전이 조건: 동표 → 동표자만 후보로 재투표 (처형 투표와 동일한 동표 로직 재사용)
              { actions: 'setTieCandidatesFromElection', target: 'electionRevote' },
            ],
          },
        },
        // 선출 재투표 — 재투표에서도 동표면 무작위 선정 (7번 섹션)
        electionRevote: {
          on: {
            VOTE: { guard: 'validElectionRevote', actions: 'registerVote' },
            // 재투표 — 단독 확정 또는 재동표·무득표 시 동표 후보 중 무작위 선정 → 발언 방향 선택
            TIME_UP: { actions: 'applyElectionRound2', target: 'directionChoice' },
          },
        },
        // 조언자 확정 직후 발언 방향(정순/역순) 선택 (5초) — 이후 밤마다도 goodSkills에서
        // 다시 고를 수 있지만, 첫날은 그 전에 밤이 없어 이 창이 유일한 기회다. 선택하면
        // 타이머를 기다리지 않고 곧바로 개인 발언으로 진행
        directionChoice: {
          on: {
            ADVISOR_DIRECTION: { actions: 'setSpeechDirection', target: '#daySpeech' },
            TIME_UP: { target: '#daySpeech' },
          },
        },
      },
    },

    /* ═══ 낮 페이즈 (requirements 5번·7번 발언 순서) ═══ */
    // dawn(새벽 사망 판정)·flowerDecision(자청비)은 13번 피드백으로 night 안으로 이동했다.
    day: {
      initial: 'personalSpeech',
      states: {
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
        // 처형 투표 (15초, 기권 포함) — 생존자 전원이 투표를 마치면 타이머를 기다리지 않고 즉시 결과 공개로
        vote: {
          entry: 'clearVotes',
          on: {
            VOTE: [
              {
                guard: and(['validDayVote', 'allAliveVotedNoExecution']),
                actions: ['registerVote', 'snapshotVoteResult', 'setPostVoteTargetNight'],
                target: 'voteReveal',
              },
              {
                guard: and(['validDayVote', 'allAliveVotedExecDecided']),
                actions: ['registerVote', 'snapshotVoteResult', 'applyExecutionRound1', 'setPostVoteTargetFinalPlea'],
                target: 'voteReveal',
              },
              {
                guard: and(['validDayVote', 'allAliveVotedTie']),
                actions: ['registerVote', 'snapshotVoteResult', 'setTieCandidatesFromExecution', 'setPostVoteTargetTieSpeech'],
                target: 'voteReveal',
              },
              { guard: 'validDayVote', actions: 'registerVote' },
            ],
            TIME_UP: [
              // 전이 조건: 전원 기권(득표자 없음) → 결과 공개 후 밤으로 (5-4항 기권 규칙)
              {
                guard: 'execNoExecution',
                actions: ['snapshotVoteResult', 'setPostVoteTargetNight'],
                target: 'voteReveal',
              },
              // 전이 조건: 최다 득표 단독 → 결과 공개 후 최후의 변론
              {
                guard: 'execDecided',
                actions: ['snapshotVoteResult', 'applyExecutionRound1', 'setPostVoteTargetFinalPlea'],
                target: 'voteReveal',
              },
              // 전이 조건: 동표 → 결과 공개 후 최다득표자 동시 발언 20초
              {
                actions: ['snapshotVoteResult', 'setTieCandidatesFromExecution', 'setPostVoteTargetTieSpeech'],
                target: 'voteReveal',
              },
            ],
          },
        },
        // 투표 결과 공개(9번 피드백) — 누가 누구에게 투표했는지 5초간 보여준 뒤에만 다음
        // 단계(밤·최후의 변론·동시 발언)로 진행한다. 목적지는 postVoteTarget에 저장돼 있다
        voteReveal: {
          on: {
            TIME_UP: [
              { guard: 'postVoteTargetIsNight', target: '#night' },
              { guard: 'postVoteTargetIsFinalPlea', target: 'finalPlea' },
              { target: 'tieSpeech' },
            ],
          },
        },
        // 동표 시 최다득표자 동시 발언 (20초) — Skip 없음 (동시 발언이므로)
        tieSpeech: {
          on: {
            TIME_UP: { target: 'revote' },
          },
        },
        // 재투표 — 재투표에서도 동표면 최다득표자 중 무작위 1인 처형 (5-4항).
        // 생존자 전원이 투표를 마치면 타이머를 기다리지 않고 즉시 결과 공개로
        revote: {
          entry: 'clearVotes',
          on: {
            VOTE: [
              {
                guard: and(['validDayRevote', 'allAliveRevoted']),
                actions: ['registerVote', 'snapshotVoteResult', 'applyExecutionRound2', 'setPostVoteTargetFinalPlea'],
                target: 'voteReveal',
              },
              { guard: 'validDayRevote', actions: 'registerVote' },
            ],
            // 재투표 — 단독 확정 또는 재동표(·전원 기권) 시 동표 후보 중 무작위 1인 처형,
            // 역시 결과 공개(voteReveal)를 거친 뒤 최후의 변론으로
            TIME_UP: {
              actions: ['snapshotVoteResult', 'applyExecutionRound2', 'setPostVoteTargetFinalPlea'],
              target: 'voteReveal',
            },
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
    // 순서(13번 피드백 재배치): 악 토론 → 악 투표 → 악 개별 스킬 → 선 스킬(도깨비·해태)
    // → 새벽 사망 판정 → 자청비 꽃 선택 → (다음 낮/밤으로)
    night: {
      id: 'night',
      initial: 'evilDiscussion',
      entry: 'clearNightState',
      states: {
        // 1) 악 진영 토론 (90초) — 악 생존자 전원 Skip 시 조기 종료
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
        // 2) 악 진영 처치 대상 투표 (10초) — 동률 시 무작위(문서 미정 가정), 무투표면 킬 없음
        evilVote: {
          on: {
            EVIL_KILL_VOTE: { guard: 'validEvilVote', actions: 'registerEvilVote' },
            TIME_UP: { actions: 'decideNightKill', target: 'evilSkills' },
          },
        },
        // 3) 악 진영 개별 스킬 (10초) — 저승사자 길동무 / 구미호 유혹, 깡철이는 패시브
        evilSkills: {
          on: {
            JEOSEUNG_COMPANION: { guard: 'validCompanion', actions: 'setCompanion' },
            GUMIHO_SEDUCE: { guard: 'validSeduce', actions: 'useSeduce' },
            TIME_UP: { target: 'goodSkills' },
          },
        },
        // 4) 해태/도깨비/자청비 스킬 (10초, 동시 진행) — 자청비 타이밍 통합 피드백으로 이 창에 합류
        goodSkills: {
          on: {
            HAETAE_INVESTIGATE: { guard: 'validInvestigate', actions: 'recordInvestigation' },
            DOKKAEBI_PRANK: { guard: 'validPrank', actions: 'setDokkaebiProtection' },
            // 조언자: 다음 낮의 발언 방향(역순/정순) 결정 — 개인 발언 시작 전까지 유효
            ADVISOR_DIRECTION: { actions: 'setSpeechDirection' },
            // 부활꽃: 그날 밤 악 진영의 킬 대상만 후보(도깨비 보호 여부는 아직 미확정) — 선택만
            // 기록하고, 실제 반영·소모는 새벽(dawn)에 도깨비 보호 결과와 함께 일괄 처리한다
            FLOWER_REVIVE: { guard: 'validRevive', actions: 'setRevive' },
            // 멸망꽃: 생존자 1인 즉시 처형 예약 (동귀어진류 봉인은 sealedByDeathCauses로 처리,
            // 도깨비 장난으로 방어 불가 — 밤 킬 경로가 아니므로 자연히 미적용)
            FLOWER_DOOM: { guard: 'validDoom', actions: 'applyDoom' },
            // 명시적 패스 — 다른 스킬 창(해태·도깨비)이 아직 열려 있을 수 있으므로 상태 전이는 없음
            FLOWER_PASS: {},
            TIME_UP: { target: 'dawn' },
          },
        },
        // 5) 새벽 판정: 일차 증가 → 연민 부활 → 도깨비 보호 + 자청비 부활꽃을 함께 반영한 밤 킬 판정
        dawn: {
          id: 'dawn',
          entry: 'applyDawn',
          always: { actions: 'setResumeDay', target: '#resolveDeaths' },
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
            // 전이 조건: 밤 0(첫 밤) 직후 — 9인 모드는 조언자 선출로 (1회만, 그 이후 밤은 해당 없음)
            { guard: 'firstMorningPending', actions: 'consumeFirstMorningPending', target: '#firstMorning' },
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
