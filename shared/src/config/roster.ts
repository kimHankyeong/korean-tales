/**
 * 인원수 모드별 캐릭터 로스터 — docs/requirements.md 1번 섹션 (6인 / 9인 모드)
 *
 * 6인 모드에서 어떤 캐릭터가 빠지는지는 아직 미정(null).
 * 확정되면 requirements.md를 먼저 갱신한 뒤 여기를 채울 것.
 */

import type { CharacterId } from '../characters/characterModel';
import { ROOM_OPTIONS } from './gameConfig';

/** 인원수 모드 (6 | 9) — ROOM_OPTIONS.playerModes에서 파생 */
export type PlayerMode = (typeof ROOM_OPTIONS.playerModes)[number];

export const ROSTER_BY_MODE: Record<PlayerMode, readonly CharacterId[] | null> = {
  9: [
    // 악 진영 3
    'jeoseung',
    'kkangcheol',
    'gumiho',
    // 선 진영 5 (까치선비 포함 — 부활 시 중립 전환)
    'jacheongbi',
    'haetae',
    'dokkaebi',
    'janghwa',
    'kkachi',
    // 중립 1
    'baridegi',
  ],
  6: null, // ⚠️ 미정 — 6인 모드 로스터 확정 시 채울 것
};
