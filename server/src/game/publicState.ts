/**
 * 공개 게임 상태 변환 — 정보 은닉의 단일 관문.
 *
 * 방 전체에 브로드캐스트되는 것은 이 파일이 만드는 PublicGameState뿐이다.
 * 캐릭터/진영, 밤 행동(악 투표·킬 대상·장난·유혹·길동무), 투사 결과, 개별 투표 내역은
 * 절대 포함하지 않는다. 역할 전체 공개는 게임 종료 payload(buildRoleReveal)에서만.
 */

import type { GameOverPayload, PublicGameState } from '@korean-tales/shared';
import type { GameSnapshot } from './session';
import type { GamePlayer } from './types';

/** XState 상태값을 "day.vote" 같은 경로 문자열로 평탄화 */
export function phasePath(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const [key, inner] = Object.entries(value)[0] ?? [];
    if (key !== undefined) return `${key}.${phasePath(inner)}`;
  }
  return String(value);
}

export function toPublicGameState(
  snapshot: GameSnapshot,
  names: Record<string, string>,
): PublicGameState {
  const { context } = snapshot;
  return {
    phase: snapshot.status === 'done' ? 'gameOver' : phasePath(snapshot.value),
    day: context.day,
    players: context.players.map((p) => ({
      id: p.id,
      name: names[p.id] ?? p.id,
      seat: p.seat,
      alive: p.alive,
    })),
    advisorId: context.advisorId,
    speechDirection: context.speechDirection,
    currentSpeakerId: context.speechQueue[0] ?? null,
    candidates: [...context.candidates],
    tieCandidates: [...context.tieCandidates],
    executionTargetId: context.executionTargetId,
    awaiting: context.awaiting ? { ...context.awaiting } : null,
    winner: context.winner,
  };
}

/** 게임 종료 시에만 호출 — 역할 전체 공개 */
export function buildRoleReveal(players: readonly GamePlayer[]): GameOverPayload['roles'] {
  return players.map((p) => ({
    playerId: p.id,
    characterId: p.characterId,
    faction: p.faction,
  }));
}
