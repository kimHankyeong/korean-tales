/**
 * 상태 전이 순수 로직 — docs/requirements.md 4·5·7·8번 섹션 기반
 *
 * 이 파일의 함수는 전부 순수 함수다: 입력을 변형하지 않고 새 값을 반환하며,
 * 무작위가 필요한 곳은 rng를 주입받는다. XState 머신(machine.ts)의
 * guard/action은 여기 함수들을 조합해서만 동작한다.
 */

import type { DeathCause, Faction, InvestigationResult, SkillId } from '@korean-tales/shared';
import { CHARACTER_BY_ID } from '@korean-tales/shared';
import type {
  AwaitingTrigger,
  DeathTriggerKind,
  GamePlayer,
  PendingDeath,
} from './types';

/* ── 공통 헬퍼 ─────────────────────────────────────── */

export function getPlayer(players: readonly GamePlayer[], id: string): GamePlayer | undefined {
  return players.find((p) => p.id === id);
}

export function alivePlayers(players: readonly GamePlayer[]): GamePlayer[] {
  return players.filter((p) => p.alive);
}

export function aliveOfFaction(players: readonly GamePlayer[], faction: Faction): GamePlayer[] {
  return alivePlayers(players).filter((p) => p.faction === faction);
}

/** 캐릭터 정의(shared)의 uses 제한을 기준으로 스킬 사용 가능 여부 판정 */
export function canUseSkill(player: GamePlayer, skillId: SkillId): boolean {
  const skill = CHARACTER_BY_ID[player.characterId].skills.find((s) => s.id === skillId);
  if (!skill) return false;
  const used = player.skillUses[skillId] ?? 0;
  return skill.uses === 'UNLIMITED' || used < skill.uses;
}

export function markSkillUsed(players: readonly GamePlayer[], playerId: string, skillId: SkillId): GamePlayer[] {
  return players.map((p) =>
    p.id === playerId
      ? { ...p, skillUses: { ...p.skillUses, [skillId]: (p.skillUses[skillId] ?? 0) + 1 } }
      : p,
  );
}

/** rng ∈ [0,1) 기반 무작위 선택 */
export function pickRandom<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new Error('pickRandom: empty list');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/* ── 투표 판정 (requirements 5-4항 기권/동표 규칙, 7번 선출 동표 규칙 공용) ── */

export type VoteOutcome =
  /** 득표자가 아무도 없음 (전원 기권/미투표) → 처형 없음 */
  | { kind: 'NO_TARGET' }
  /** 최다 득표자 단독 확정 — 기권표가 다수여도 무관 */
  | { kind: 'DECIDED'; targetId: string }
  /** 최다 득표 동률 */
  | { kind: 'TIE'; candidates: string[] };

export function tallyVotes(votes: Record<string, string | 'ABSTAIN'>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    if (target === 'ABSTAIN') continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

export function resolveVoteOutcome(votes: Record<string, string | 'ABSTAIN'>): VoteOutcome {
  const counts = tallyVotes(votes);
  const entries = Object.entries(counts);
  if (entries.length === 0) return { kind: 'NO_TARGET' };
  const max = Math.max(...entries.map(([, n]) => n));
  const top = entries.filter(([, n]) => n === max).map(([id]) => id);
  return top.length === 1 ? { kind: 'DECIDED', targetId: top[0]! } : { kind: 'TIE', candidates: top };
}

/* ── 동표 2라운드 공통 규칙 — 처형(5-4항)·조언자 선출(7번)이 재사용 ── */

/**
 * 공통 동표 처리: 1차 동표 → 동표자들만 후보로 재대결(ESCALATE),
 * 재투표(2차)에서도 동표 → 무작위(RANDOM). 득표자 없음은 호출부가 해석한다.
 * 무작위 추첨 자체는 하지 않고 pool만 반환한다 — rng 실행은 액션(호출부) 몫.
 */
export type TieBreakResult =
  | { kind: 'DECIDED'; targetId: string }
  | { kind: 'ESCALATE'; candidates: string[] }
  | { kind: 'RANDOM'; pool: string[] }
  | { kind: 'NO_TARGET' };

export function resolveTieBreak(
  votes: Record<string, string | 'ABSTAIN'>,
  round: 1 | 2,
): TieBreakResult {
  const outcome = resolveVoteOutcome(votes);
  if (outcome.kind === 'NO_TARGET') return { kind: 'NO_TARGET' };
  if (outcome.kind === 'DECIDED') return { kind: 'DECIDED', targetId: outcome.targetId };
  return round === 1
    ? { kind: 'ESCALATE', candidates: outcome.candidates }
    : { kind: 'RANDOM', pool: outcome.candidates };
}

/* ── 처형 투표 판정 (5-4항) ────────────────────────── */

export type ExecutionVoteResult =
  /** 전원 기권 → 희생자 없이 밤 전환 (기권표가 다수여도 1표라도 있으면 처형) */
  | { kind: 'NO_EXECUTION' }
  | { kind: 'EXECUTE'; targetId: string }
  /** 재투표 동표 → 최다득표자 중 무작위 1인 처형 (추첨은 호출부에서 rng로) */
  | { kind: 'EXECUTE_RANDOM'; pool: string[] }
  /** 1차 동표 → 최다득표자 20초 동시 발언 후 재투표 */
  | { kind: 'TIE_SPEECH'; candidates: string[] };

export function resolveExecutionVote(
  votes: Record<string, string | 'ABSTAIN'>,
  round: 1 | 2,
  tieCandidates: readonly string[] = [],
): ExecutionVoteResult {
  const result = resolveTieBreak(votes, round);
  switch (result.kind) {
    case 'DECIDED':
      return { kind: 'EXECUTE', targetId: result.targetId };
    case 'ESCALATE':
      return { kind: 'TIE_SPEECH', candidates: result.candidates };
    case 'RANDOM':
      return { kind: 'EXECUTE_RANDOM', pool: result.pool };
    case 'NO_TARGET':
      // 1차: 기권 규칙 — 무처형. 재투표 전원 기권은 동표 후보 중 무작위 (⚠️ 문서 미정 — 가정)
      return round === 1
        ? { kind: 'NO_EXECUTION' }
        : { kind: 'EXECUTE_RANDOM', pool: [...tieCandidates] };
  }
}

/* ── 조언자 선출 투표 판정 (7번) — 처형과 동일한 동표 로직(resolveTieBreak) 재사용 ── */

export type ElectionVoteResult =
  | { kind: 'ELECTED'; advisorId: string }
  /** 동표·무득표 → pool 중 무작위 선정 (추첨은 호출부에서 rng로) */
  | { kind: 'ELECT_RANDOM'; pool: string[] }
  /** 1차 동표 → 동표자만 후보로 재투표 */
  | { kind: 'REVOTE'; candidates: string[] };

export function resolveElectionVote(
  votes: Record<string, string | 'ABSTAIN'>,
  round: 1 | 2,
  pools: { candidates: readonly string[]; tieCandidates?: readonly string[] },
): ElectionVoteResult {
  const result = resolveTieBreak(votes, round);
  switch (result.kind) {
    case 'DECIDED':
      return { kind: 'ELECTED', advisorId: result.targetId };
    case 'ESCALATE':
      return { kind: 'REVOTE', candidates: result.candidates };
    case 'RANDOM':
      return { kind: 'ELECT_RANDOM', pool: result.pool };
    case 'NO_TARGET': {
      // 무득표 → 후보(재투표면 동표 후보) 중 무작위 (⚠️ 문서 미정 — 가정)
      const pool =
        round === 2 && pools.tieCandidates?.length ? pools.tieCandidates : pools.candidates;
      return { kind: 'ELECT_RANDOM', pool: [...pool] };
    }
  }
}

/** 선출 투표권 판정: 출마한 유저에게는 투표권 없음 (7번) */
export function canVoteInElection(
  players: readonly GamePlayer[],
  voterId: string,
  candidates: readonly string[],
): boolean {
  const voter = getPlayer(players, voterId);
  return !!voter?.alive && !candidates.includes(voterId);
}

/* ── 낮 개인 발언 순서 (requirements 7번 조언자 규칙) ── */

/**
 * 매 아침의 개인 발언 순서를 계산한다.
 * - 조언자는 매일 제일 마지막에 발언.
 * - 방향은 조언자가 결정: FORWARD = 조언자 다음 번호부터 정순(번호 증가) 순환,
 *   REVERSE = 조언자 이전 번호부터 역순(번호 감소) 순환.
 * - 조언자가 없거나(7인 모드·방울 파기·미선출) 사망했으면 앞번호부터 정순 고정.
 */
export function computeSpeechOrder(
  players: readonly GamePlayer[],
  advisorId: string | null,
  direction: 'FORWARD' | 'REVERSE',
): string[] {
  const alive = alivePlayers(players).sort((a, b) => a.seat - b.seat);
  const advisor = advisorId ? alive.find((p) => p.id === advisorId) : undefined;
  if (!advisor) return alive.map((p) => p.id);

  const after = alive.filter((p) => p.seat > advisor.seat); // 조언자 뒤 번호 (오름차순)
  const before = alive.filter((p) => p.seat < advisor.seat); // 조언자 앞 번호 (오름차순)
  const ordered =
    direction === 'FORWARD'
      ? [...after, ...before] // 다음 번호부터 증가 방향 순환
      : [...before.reverse(), ...after.reverse()]; // 이전 번호부터 감소 방향 순환
  return [...ordered.map((p) => p.id), advisor.id];
}

/* ── 밤 킬 대상 판정 (requirements 4-3항) ─────────── */

/**
 * 악 진영 처치 투표 집계. 동률 처리는 문서 미정 → 최다득표자 중 무작위(주석 참고).
 * 아무도 투표하지 않으면 킬 없음(null).
 */
export function resolveNightKillTarget(
  evilVotes: Record<string, string>,
  rng: () => number,
): string | null {
  const outcome = resolveVoteOutcome(evilVotes);
  if (outcome.kind === 'NO_TARGET') return null;
  if (outcome.kind === 'DECIDED') return outcome.targetId;
  return pickRandom(outcome.candidates, rng); // ⚠️ 동률 규칙 미정 — 무작위로 가정
}

/* ── 승리 판정 (requirements 8번) ──────────────────── */

/**
 * 탈락에 의한 승리 — 일차와 무관하게 매 사망 처리 후 체크.
 * 중립(바리공주, 전향한 까치선비)이 모두 탈락하면 선 진영 생존자 수와 무관하게
 * 즉시 악 진영 승리로 끝난다(단, 악 진영도 이미 전멸했다면 그쪽이 우선).
 * 투항에 의한 승리는 소켓/타이머 연동 시 별도 이벤트로 처리 예정.
 */
export function checkWin(players: readonly GamePlayer[]): Faction | null {
  const evilAlive = aliveOfFaction(players, 'EVIL').length;
  const goodAlive = aliveOfFaction(players, 'GOOD').length;
  const neutralAlive = aliveOfFaction(players, 'NEUTRAL').length;
  if (evilAlive === 0 && goodAlive === 0) return 'GOOD'; // ⚠️ 동시 전멸 규칙 미정 — 선 승리로 가정
  if (evilAlive === 0) return 'GOOD';
  if (goodAlive === 0) return 'EVIL';
  if (neutralAlive === 0) return 'EVIL'; // 중립 전멸 — 선 생존자 수와 무관하게 즉시 악 승리
  return null;
}

/* ── 해태 투사 (requirements 3번) ──────────────────── */

/** 결과는 캐릭터 정의의 investigationResult를 따른다 — 깡철이는 NOT_EVIL */
export function investigate(target: GamePlayer): InvestigationResult {
  return CHARACTER_BY_ID[target.characterId].investigationResult;
}

/* ── 스킬 상호작용 판정 (requirements 3·4·5번 섹션)
 *
 * 우선순위 정리:
 * 1) 도깨비 장난 — 그 밤의 악 진영 킬을 무효화. 멸망꽃(아침)은 막지 못하고,
 *    차단 사실은 악 진영에게 비공개 (아침 공지는 킬 없음과 동일한 "사망자 없음")
 * 2) 부활꽃 — "그날 밤 악 진영 킬로 사망한 사람"만 대상 (동반사망자·처형자 제외)
 * 3) 연민 — 까치선비(부활 수혜자) 한정, 사망 원인 불문 (멸망꽃 사망도 부활 가능)
 * 4) 멸망꽃 사망 — 동귀어진류(피 맺힌 유서) 스킬 기회 자체를 봉인
 * 5) 부활자의 이미 사용한 1회성 스킬은 소모된 상태로 유지 (skillUses를 절대 초기화하지 않음)
 */

export interface NightKillResolution {
  killedPlayerId: string | null;
  /** 아침 전체 공지 — 보호 성공이든 킬 없음이든 동일하게 NO_DEATH("사망자 없음") */
  announcement: 'DEATH' | 'NO_DEATH';
  /** 도깨비 보호가 이번 판정에서 실제로 킬을 막았는지 — 성공하면 스킬이 영구 소모된다 */
  protectionSucceeded: boolean;
}

/** 1) 밤 킬 판정 — 도깨비가 지정한 보호 대상이 킬 대상과 같으면 보호 성공(킬 무효) */
export function resolveNightKillOutcome(
  players: readonly GamePlayer[],
  nightKillTargetId: string | null,
  protectTargetId: string | null,
): NightKillResolution {
  if (nightKillTargetId === null) {
    return { killedPlayerId: null, announcement: 'NO_DEATH', protectionSucceeded: false };
  }
  const target = getPlayer(players, nightKillTargetId);
  if (!target?.alive) return { killedPlayerId: null, announcement: 'NO_DEATH', protectionSucceeded: false };
  // 보호 성공 — 악 진영에게 따로 알리지 않으며, 공지는 킬 없음과 구분 불가
  if (protectTargetId !== null && protectTargetId === nightKillTargetId) {
    return { killedPlayerId: null, announcement: 'NO_DEATH', protectionSucceeded: true };
  }
  return { killedPlayerId: target.id, announcement: 'DEATH', protectionSucceeded: false };
}

/** 4) 멸망꽃 사망 → 동귀어진류(피 맺힌 유서) 봉인 판정 — sealedByDeathCauses 기반 */
export function isTakeAlongSealed(victim: GamePlayer, cause: DeathCause): boolean {
  const skill = CHARACTER_BY_ID[victim.characterId].skills.find(
    (s) => s.effectKind === 'TAKE_ALONG_ON_DEATH',
  );
  return !!skill?.sealedByDeathCauses?.includes(cause);
}

/**
 * 저승길 동무 봉인 판정 — 자청비 멸망꽃으로 사망한 저승사자는 길동무 동반 사망이 발동하지 않는다
 * (사용 횟수는 밤에 지정한 시점에 이미 소모되었으므로 그대로 유지, 트리거만 무효화됨)
 */
export function isCompanionSealed(victim: GamePlayer, cause: DeathCause): boolean {
  const skill = CHARACTER_BY_ID[victim.characterId].skills.find(
    (s) => s.effectKind === 'COMPANION_ON_DEATH',
  );
  return !!skill?.sealedByDeathCauses?.includes(cause);
}

/** 3) 연민 적용 판정 — 부활 수혜자(까치선비) 한정, 부활자(바리공주) 생존 + 양쪽 스킬 미소모 */
export function compassionApplies(players: readonly GamePlayer[], victim: GamePlayer): boolean {
  const beneficiary = CHARACTER_BY_ID[victim.characterId].skills.find(
    (s) => s.effectKind === 'REVIVE_BENEFICIARY',
  );
  if (!beneficiary || !canUseSkill(victim, beneficiary.id)) return false;
  const reviver = players.find((p) => p.characterId === beneficiary.reviverCharacterId);
  const reviverSkill =
    reviver && CHARACTER_BY_ID[reviver.characterId].skills.find((s) => s.effectKind === 'AUTO_REVIVE');
  return !!reviver?.alive && !!reviverSkill && canUseSkill(reviver, reviverSkill.id);
}

/* ── 사망 확정 트리거 처리 (requirements 5-6항) ────── */

export interface DeathProcessState {
  players: GamePlayer[];
  pendingDeaths: PendingDeath[];
  scheduledRevivals: string[];
  advisorId: string | null;
  advisorBroken: boolean;
  companionTargetId: string | null;
  awaiting: AwaitingTrigger | null;
  /** 방금 확정된 공개 발표 문구 (예: "저승사자가 길동무로 3번을 선택했습니다") — 없으면 null */
  deathAnnouncement: { text: string; durationMs: number } | null;
}

/**
 * 사망자 1인의 트리거 목록 계산 (처리 순서 고정):
 * 1) COMPANION — 저승길 동무 지정 상태면 동반 사망 (사망 원인 무관, 자동)
 * 2) GRUDGE — 피 맺힌 유서 보유·미사용·봉인 원인 아님 (멸망꽃 사망 시 제외, 입력 대기)
 * 3) SUCCESSION — 사망자가 조언자면 승계/파기 (입력 대기)
 * 4) KKACHI_REVIVAL — 연민 보유자(바리공주) 생존 시 부활 예약 (원인 불문, 자동)
 */
export function computeDeathTriggers(
  state: Pick<DeathProcessState, 'players' | 'advisorId' | 'companionTargetId'>,
  victim: GamePlayer,
  death: PendingDeath,
): DeathTriggerKind[] {
  const triggers: DeathTriggerKind[] = [];
  const character = CHARACTER_BY_ID[victim.characterId];

  // 저승사자류: 길동무 동반 사망 — 멸망꽃 사망이면 봉인(isCompanionSealed)되어 발동하지 않음
  if (
    character.skills.some((s) => s.effectKind === 'COMPANION_ON_DEATH') &&
    state.companionTargetId !== null &&
    !isCompanionSealed(victim, death.cause)
  ) {
    triggers.push('COMPANION');
  }

  // 장화홍련류: 동귀어진 — 멸망꽃 사망이면 봉인(isTakeAlongSealed)되어 기회 자체가 없음
  const grudgeSkill = character.skills.find((s) => s.effectKind === 'TAKE_ALONG_ON_DEATH');
  if (grudgeSkill && canUseSkill(victim, grudgeSkill.id) && !isTakeAlongSealed(victim, death.cause)) {
    triggers.push('GRUDGE');
  }

  // 조언자: 방울 승계/파기
  if (state.advisorId === victim.id) triggers.push('SUCCESSION');

  // 까치선비류: 연민 — 사망 원인 불문, 부활자(바리공주) 생존 + 양쪽 스킬 미소모
  if (compassionApplies(state.players, victim)) {
    triggers.push('KKACHI_REVIVAL');
  }

  return triggers;
}

/**
 * 사망 큐를 처리한다. 자동 트리거(동반 사망·부활 예약)는 연쇄까지 즉시 처리하고,
 * 입력이 필요한 트리거(GRUDGE/SUCCESSION)를 만나면 awaiting을 설정하고 중단한다.
 * 입력 이벤트가 트리거를 소진시킨 뒤 다시 호출하면 이어서 처리한다.
 */
export function processDeathQueue(input: DeathProcessState): DeathProcessState {
  const state: DeathProcessState = {
    ...input,
    players: input.players.map((p) => ({ ...p, skillUses: { ...p.skillUses } })),
    pendingDeaths: input.pendingDeaths.map((d) => ({
      ...d,
      triggers: d.triggers ? [...d.triggers] : undefined,
    })),
    scheduledRevivals: [...input.scheduledRevivals],
    awaiting: null,
    // deathAnnouncement는 여기서 초기화하지 않는다 — GRUDGE_TARGET 처리(applyGrudge)가
    // 먼저 문구를 세팅한 뒤 reenter로 이 함수가 다시 호출되는데, 여기서 null로 밀어버리면
    // Room이 방송하기도 전에 사라진다. 이번 호출에서 새 트리거가 문구를 만들면 덮어쓰고,
    // 아니면 들어온 값을 그대로 들고 나간다(문자열 동일성 기반 중복 방송 방지는 Room 담당).
  };

  while (state.pendingDeaths.length > 0) {
    const death = state.pendingDeaths[0]!;
    const victim = getPlayer(state.players, death.playerId);
    if (!victim) {
      state.pendingDeaths.shift();
      continue;
    }

    // 사망 반영 (밤 킬은 새벽에 이미 applied 상태로 들어옴)
    if (!death.applied) {
      if (!victim.alive) {
        // 이미 다른 경로로 사망 — 중복 건 폐기
        state.pendingDeaths.shift();
        continue;
      }
      victim.alive = false;
      death.applied = true;
    }

    if (!death.triggers) {
      death.triggers = computeDeathTriggers(state, victim, death);
    }

    let needsInput = false;
    while (death.triggers.length > 0) {
      const trigger = death.triggers[0]!;

      if (trigger === 'COMPANION') {
        // 길동무 동반 사망 — 지정자가 생존 중일 때만, 지정은 소모됨
        const targetId = state.companionTargetId;
        state.companionTargetId = null;
        const target = targetId ? getPlayer(state.players, targetId) : undefined;
        if (target?.alive) {
          state.pendingDeaths.push({ playerId: target.id, cause: 'COMPANION_DEATH', applied: false });
          state.deathAnnouncement = { text: `저승사자가 길동무로 ${target.seat}번을 선택했습니다`, durationMs: 4000 };
        }
        death.triggers.shift();
      } else if (trigger === 'KKACHI_REVIVAL') {
        // 연민 자동 부활 예약 — 다음 새벽에 부활, 양쪽 1회성 스킬 소모
        const character = CHARACTER_BY_ID[victim.characterId];
        const beneficiary = character.skills.find((s) => s.effectKind === 'REVIVE_BENEFICIARY')!;
        state.scheduledRevivals.push(victim.id);
        state.players = markSkillUsed(state.players, victim.id, beneficiary.id);
        const reviver = state.players.find((p) => p.characterId === beneficiary.reviverCharacterId);
        if (reviver) {
          const reviverSkill = CHARACTER_BY_ID[reviver.characterId].skills.find(
            (s) => s.effectKind === 'AUTO_REVIVE',
          );
          if (reviverSkill) state.players = markSkillUsed(state.players, reviver.id, reviverSkill.id);
        }
        death.triggers.shift();
      } else {
        // GRUDGE / SUCCESSION — 플레이어 입력 대기 (10초 타이머는 외부에서 TIME_UP으로 종료)
        state.awaiting = { kind: trigger, playerId: victim.id };
        needsInput = true;
        break;
      }
    }

    if (needsInput) break;
    state.pendingDeaths.shift();
  }

  return state;
}

/* ── 새벽 처리 (밤 → 낮 전환, requirements 4-4항·연민 부활) ── */

export interface DawnResult {
  players: GamePlayer[];
  pendingDeaths: PendingDeath[];
  scheduledRevivals: string[];
  /**
   * 도깨비 장난이 그날 밤 킬을 막아 살아남은 대상 — 자청비가 이 대상에게 부활꽃을 써도
   * "쓴 것으로" 처리(둘 다 소모)할 수 있도록 다음 아침 꽃 단계까지 넘겨준다.
   */
  protectedTargetId: string | null;
}

/**
 * 새벽에 수행되는 일괄 처리:
 * 1) 연민 예약 부활 — 부활한 까치선비는 진영이 NEUTRAL로 전환 (convertsToFactionOnRevive)
 * 2) 밤 킬 판정 — 도깨비 보호 대상이 킬 대상과 같으면 무효("사망자 없음") + 도깨비 장난 영구 소모,
 *    아니면 즉시 사망 반영. 단 사망 트리거는 자청비 꽃 단계 이후에 처리하므로 pendingDeaths에 applied 상태로 적재.
 */
export function processDawn(input: {
  players: GamePlayer[];
  scheduledRevivals: string[];
  nightKillTargetId: string | null;
  dokkaebiProtectTargetId: string | null;
}): DawnResult {
  let players = input.players.map((p) => ({ ...p, skillUses: { ...p.skillUses } }));

  // 1) 예약 부활 — 사용한 1회성 스킬은 복구하지 않는다 (부활자 공통 규칙)
  for (const id of input.scheduledRevivals) {
    players = players.map((p) => {
      if (p.id !== id) return p;
      const beneficiary = CHARACTER_BY_ID[p.characterId].skills.find(
        (s) => s.effectKind === 'REVIVE_BENEFICIARY',
      );
      return { ...p, alive: true, faction: beneficiary?.convertsToFactionOnRevive ?? p.faction };
    });
  }

  // 2) 밤 킬 판정 — 도깨비 보호가 성공했으면 무효 ("사망자 없음", 차단 사실 비공개) + 스킬 영구 소모
  const pendingDeaths: PendingDeath[] = [];
  const killOutcome = resolveNightKillOutcome(players, input.nightKillTargetId, input.dokkaebiProtectTargetId);
  if (killOutcome.killedPlayerId !== null) {
    players = players.map((p) =>
      p.id === killOutcome.killedPlayerId ? { ...p, alive: false } : p,
    );
    pendingDeaths.push({ playerId: killOutcome.killedPlayerId, cause: 'EVIL_NIGHT_KILL', applied: true });
  }
  if (killOutcome.protectionSucceeded) {
    const dokkaebi = players.find((p) => p.characterId === 'dokkaebi');
    if (dokkaebi) players = markSkillUsed(players, dokkaebi.id, 'prank');
  }

  return {
    players,
    pendingDeaths,
    scheduledRevivals: [],
    protectedTargetId: killOutcome.protectionSucceeded ? input.nightKillTargetId : null,
  };
}

/* ── 부활꽃 대상 판정 (requirements 5-1항) ─────────── */

/**
 * 부활꽃 대상: "그날 밤 악 진영 킬로 사망한 사람"만.
 * 동반 사망자(저승길 동무·피 맺힌 유서)·투표 처형자는 대상이 아니다 — cause로 판별.
 */
export function isRevivableTonight(pendingDeaths: readonly PendingDeath[], targetId: string): boolean {
  return pendingDeaths.some(
    (d) => d.playerId === targetId && d.cause === 'EVIL_NIGHT_KILL' && d.applied,
  );
}
