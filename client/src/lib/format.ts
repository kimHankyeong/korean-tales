/**
 * 채팅창 표시 문구 포맷 — docs/requirements.md 6번 섹션의 문구 규격을 그대로 따른다.
 */

export type PhaseKind = 'DAY' | 'NIGHT';

/** 발언 순서 표시: `(해)낮-80초-1번` (6번 섹션 포맷) */
export function formatSpeechOrderLabel(
  phase: PhaseKind,
  personalSpeechSeconds: number,
  seat: number,
): string {
  const icon = phase === 'DAY' ? '해' : '달';
  const label = phase === 'DAY' ? '낮' : '밤';
  return `(${icon})${label}-${personalSpeechSeconds}초-${seat}번`;
}

/** 카운트다운 문구: `토론 시간 00초 남음` / `개인 발언 시간 00초 남음` (6번 섹션) */
export function formatCountdown(label: string, secondsLeft: number): string {
  const safe = Math.max(0, Math.ceil(secondsLeft));
  return `${label} ${String(safe).padStart(2, '0')}초 남음`;
}

/** 플레이어 목록 등 좁은 공간용 닉네임 축약: 4글자 초과 시 "..."으로 표시 (예: "불닭볶음...") */
export function truncateName(name: string, max = 4): string {
  return name.length > max ? `${name.slice(0, max)}...` : name;
}
