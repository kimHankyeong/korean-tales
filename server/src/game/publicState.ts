/**
 * 공개 게임 상태 변환 — 정보 은닉의 단일 관문.
 *
 * 방 전체에 브로드캐스트되는 것은 이 파일이 만드는 PublicGameState뿐이다.
 * 캐릭터/진영, 밤 행동(악 투표·킬 대상·장난·유혹·길동무), 투사 결과, 개별 투표 내역은
 * 절대 포함하지 않는다. 역할 전체 공개는 게임 종료 payload(buildGameResult)에서만.
 */

import type { Faction, GameOverPayload, PublicGameState } from '@korean-tales/shared';
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

export interface PlayerMeta {
  name: string;
  avatarUrl: string | null;
}

export function toPublicGameState(
  snapshot: GameSnapshot,
  meta: Record<string, PlayerMeta>,
): PublicGameState {
  const { context } = snapshot;
  const phase = snapshot.status === 'done' ? 'gameOver' : phasePath(snapshot.value);
  // 밤 사망은 새벽(dawn)~resolveDeaths(밤→낮 경로) 동안 내부적으로 확정되지만, 낮이 시작되어
  // 공식 발표될 때까지 다른 플레이어에게 노출되면 안 된다(4-c 피드백) — 이 구간에는 밤 시작
  // 시점의 생존 스냅샷을 그대로 공개해 조기 노출을 막는다
  const maskNightDeaths =
    phase === 'night.dawn' || (phase.startsWith('resolveDeaths') && context.resumeAfterDeaths === 'DAY_DISCUSSION');
  return {
    phase,
    day: context.day,
    players: context.players.map((p) => ({
      id: p.id,
      name: meta[p.id]?.name ?? p.id,
      seat: p.seat,
      alive: maskNightDeaths ? (context.nightStartAlive[p.id] ?? p.alive) : p.alive,
      avatarUrl: meta[p.id]?.avatarUrl ?? null,
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

/**
 * 게임 종료 결과 — 역할 전체 공개 + 개인별 승패 귀속 (requirements 8번).
 *
 * 귀속 규칙:
 * - 승리 진영 소속이면 (생존 여부와 무관하게) 승자로 처리
 * - 중립(바리공주·전향한 까치선비)은 "생존 시 승리 팀에 합류":
 *   · 선 승리 시 생존 중립 합류는 requirements 8번에 확정
 *   · ⚠️ 악 승리 시 중립 합류, 사망한 중립의 귀속(비승자 처리)은 문서 미확정 — 같은 규칙으로 가정
 */
export function buildGameResult(
  players: readonly GamePlayer[],
  winner: Faction,
): GameOverPayload {
  return {
    winner,
    roles: players.map((p) => ({
      playerId: p.id,
      characterId: p.characterId,
      faction: p.faction,
      alive: p.alive,
      isWinner: p.faction === winner || (p.faction === 'NEUTRAL' && p.alive),
    })),
  };
}
