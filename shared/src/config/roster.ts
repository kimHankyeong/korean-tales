/**
 * 인원수 모드별 캐릭터 로스터 — docs/requirements.md 1번 섹션 (7인 / 9인 모드)
 *
 * 7인 모드: 깡철이·까치선비 제외, 조언자 선출 없음. 스킬·승리 조건은 9인 모드와 동일.
 */

import type { CharacterId } from '../characters/characterModel';
import { ROOM_OPTIONS } from './gameConfig';

/** 인원수 모드 (7 | 9) — ROOM_OPTIONS.playerModes에서 파생 */
export type PlayerMode = (typeof ROOM_OPTIONS.playerModes)[number];

export const ROSTER_BY_MODE: Record<PlayerMode, readonly CharacterId[]> = {
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
  7: [
    // 악 진영 2
    'jeoseung',
    'gumiho',
    // 선 진영 4
    'jacheongbi',
    'haetae',
    'dokkaebi',
    'janghwa',
    // 중립 1
    'baridegi',
  ],
};

/** 모드별 조언자 선출 진행 여부 — 7인 모드는 조언자 뽑기 제외 (발언 순서 정순 고정) */
export const ADVISOR_ELECTION_BY_MODE: Record<PlayerMode, boolean> = {
  9: true,
  7: false,
};
