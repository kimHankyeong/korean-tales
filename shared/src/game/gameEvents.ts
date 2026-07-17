/**
 * 게임 상태 머신 이벤트 계약 — client/server 공용.
 * 서버의 XState 머신이 이 이벤트를 소비하고, 클라이언트는 ClientGameAction만 발행할 수 있다.
 */

import type { Faction } from '../characters/characterModel';

export type GameEvent =
  /** 서버 권위 타이머 만료 — 서버 전용 (클라이언트 발행 불가) */
  | { type: 'TIME_UP' }
  /**
   * Skip 요청 (1번 섹션):
   * - 개인 발언/어필/최후의 변론: 발언 당사자 본인만 유효 → 즉시 다음 단계
   * - 전체 토론(선출·낮·악 토론): 해당 생존자 전원이 누르면 조기 종료
   */
  | { type: 'SKIP'; playerId: string }
  /* 첫날 아침 — 조언자 선출 */
  | { type: 'CANDIDACY_APPLY'; playerId: string }
  /* 투표 (선출/처형/재투표 공용) */
  | { type: 'VOTE'; voterId: string; targetId: string | 'ABSTAIN' }
  /* 조언자: 매 아침 발언 방향 결정 */
  | { type: 'ADVISOR_DIRECTION'; direction: 'FORWARD' | 'REVERSE' }
  /* 낮 시작 — 자청비 */
  | { type: 'FLOWER_REVIVE'; targetId: string }
  | { type: 'FLOWER_DOOM'; targetId: string }
  | { type: 'FLOWER_PASS' }
  /* 밤 — 선 진영 */
  | { type: 'HAETAE_INVESTIGATE'; targetId: string }
  | { type: 'DOKKAEBI_PRANK'; targetId: string }
  /* 밤 — 악 진영 */
  | { type: 'EVIL_KILL_VOTE'; voterId: string; targetId: string }
  | { type: 'JEOSEUNG_COMPANION'; targetId: string }
  | { type: 'GUMIHO_SEDUCE' }
  /* 사망 확정 트리거 응답 */
  | { type: 'GRUDGE_TARGET'; targetId: string }
  | { type: 'GRUDGE_FORGO' }
  | { type: 'ADVISOR_SUCCEED'; targetId: string }
  | { type: 'ADVISOR_DESTROY' }
  /**
   * 팀 전원 투항 확정 (6번 섹션) — 서버 전용.
   * 30초 팀 동의 집계는 방(Room) 레이어가 담당하고, 전원 동의 시 이 이벤트로 게임을 끝낸다.
   */
  | { type: 'TEAM_SURRENDER'; faction: Faction };

/** 클라이언트가 발행할 수 있는 액션 — 서버 전용 이벤트(TIME_UP·TEAM_SURRENDER) 제외 */
export type ClientGameAction = Exclude<GameEvent, { type: 'TIME_UP' } | { type: 'TEAM_SURRENDER' }>;
