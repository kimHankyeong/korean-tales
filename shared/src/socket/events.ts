/**
 * Socket.io 이벤트 이름·페이로드 계약 — client/server 공용.
 * 지금은 서버 권위 타이머 동기화 인터페이스만 정의한다 (UI 연동은 이후 세션).
 */

export const SOCKET_EVENTS = {
  /** 서버 → 클라이언트: 페이즈 타이머 시작/갱신 (카운트다운 동기화) */
  timerSync: 'timer:sync',
  /** 서버 → 클라이언트: 타이머 없는 상태로 전환 (카운트다운 숨김) */
  timerClear: 'timer:clear',
} as const;

/** timer:sync 페이로드 — 클라이언트는 endsAt과 serverNow의 차로 남은 시간을 계산해 표시 */
export interface TimerSyncPayload {
  /** 어떤 페이즈의 타이머인지 (상태 경로 기반 키, 예: "day.vote", "speech:p3") */
  phaseKey: string;
  durationSeconds: number;
  /** 서버 기준 만료 시각 (epoch ms) */
  endsAt: number;
  /** 페이로드 생성 시점의 서버 시각 (epoch ms) — 클라이언트 시계 보정용 */
  serverNow: number;
}
