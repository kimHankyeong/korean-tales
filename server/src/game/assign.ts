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
): Record<string, CharacterId> {
  const roster = ROSTER_BY_MODE[mode];
  if (requests.length !== roster.length) {
    throw new Error(`assignCharacters: ${mode}인 모드에는 정확히 ${roster.length}명이 필요합니다`);
  }

  const remaining = shuffle(roster, rng);
  const assignment: Record<string, CharacterId> = {};

  // 선호자 처리 순서도 무작위 — 입장 순서가 우선권이 되지 않도록
  const order = shuffle(requests, rng);

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
