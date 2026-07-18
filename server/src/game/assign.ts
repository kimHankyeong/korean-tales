/**
 * 캐릭터 무작위 배정 — 진영 선호 반영
 *
 * 규칙:
 * - 배정은 무작위 기반. 진영 선호는 "우선 고려"일 뿐 보장이 아니다 —
 *   같은 진영 선호자가 로스터 슬롯보다 많으면 무작위 순서로 일부만 반영되고,
 *   나머지는 남은 캐릭터에서 무작위 배정된다.
 * - 로스터는 shared의 ROSTER_BY_MODE(7인/9인)를 따른다.
 */

import {
  CHARACTER_BY_ID,
  ROSTER_BY_MODE,
  type CharacterId,
  type Faction,
  type PlayerMode,
} from '@korean-tales/shared';

export interface AssignmentRequest {
  playerId: string;
  /** 선택한 진영과 다르게 배정될 수 있다 */
  factionPreference: Faction | null;
}

/** Fisher–Yates 셔플 — rng ∈ [0,1) 주입 (테스트 결정성) */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function assignCharacters(
  requests: readonly AssignmentRequest[],
  mode: PlayerMode,
  rng: () => number,
  /** true면 정원 미달도 허용(로스터 중 무작위 일부만 배정) — 13번 관리자 인원 미달 시작 전용 */
  allowUnderstaffed = false,
  /**
   * 특정 플레이어에게 특정 캐릭터를 확정 배정(진영 선호보다 우선) — 13번 관리자 직업 선택 전용.
   * 로스터에 없는 캐릭터(다른 모드 전용 등)는 무시하고 일반 배정으로 넘어간다.
   */
  fixedAssignments?: Readonly<Record<string, CharacterId>>,
): Record<string, CharacterId> {
  const roster = ROSTER_BY_MODE[mode];
  if (requests.length > roster.length || (!allowUnderstaffed && requests.length !== roster.length)) {
    throw new Error(`assignCharacters: ${mode}인 모드에는 정확히 ${roster.length}명이 필요합니다`);
  }

  let remainingRoster = [...roster];
  const assignment: Record<string, CharacterId> = {};

  // 0) 확정 배정 — 로스터에 실재하는 캐릭터만 인정, 나머지 배정 풀에서 제외
  const fixedPlayerIds = new Set<string>();
  if (fixedAssignments) {
    for (const [playerId, characterId] of Object.entries(fixedAssignments)) {
      if (!remainingRoster.includes(characterId)) continue;
      assignment[playerId] = characterId;
      fixedPlayerIds.add(playerId);
      remainingRoster = remainingRoster.filter((c) => c !== characterId);
    }
  }

  const remaining = shuffle(remainingRoster, rng);

  // 선호자 처리 순서도 무작위 — 입장 순서가 우선권이 되지 않도록
  const order = shuffle(
    requests.filter((r) => !fixedPlayerIds.has(r.playerId)),
    rng,
  );

  // 1) 진영 선호자: 남은 캐릭터 중 해당 진영에서 배정 (없으면 일반 배정으로 넘어감)
  for (const request of order) {
    if (!request.factionPreference) continue;
    const index = remaining.findIndex(
      (c) => CHARACTER_BY_ID[c].faction === request.factionPreference,
    );
    if (index >= 0) {
      assignment[request.playerId] = remaining.splice(index, 1)[0]!;
    }
  }

  // 2) 나머지 전원: 남은 캐릭터에서 무작위(이미 셔플됨) 배정
  for (const request of order) {
    if (assignment[request.playerId]) continue;
    assignment[request.playerId] = remaining.pop()!;
  }

  return assignment;
}
