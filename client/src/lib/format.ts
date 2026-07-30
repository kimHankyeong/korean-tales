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

/**
 * timer:sync의 phaseKey(예: "evilDiscussion:3", "appeal:p5", "speech:1:p3")를 채팅창
 * 카운트다운에 보여줄 한글 라벨로 변환한다 — phaseKey를 그대로 노출하면 알아볼 수 없다.
 * ":" 뒤 발언자 id·일차 등 세부값은 라벨에 필요 없으므로 접두어만 본다.
 */
export function friendlyTimerLabel(phaseKey: string): string {
  const prefix = phaseKey.split(':')[0] ?? phaseKey;
  const labels: Record<string, string> = {
    candidacy: '조언자 출마 신청 시간',
    appeal: '조언자 후보 개인 발언 시간',
    electionDiscussion: '조언자 후보 전체 발언 시간',
    electionVote: '조언자 선출 투표 시간',
    electionRevote: '조언자 선출 재투표 시간',
    directionChoice: '발언 순서 선택 시간',
    speech: '개인 발언 시간',
    discussion: '전체 토론 시간',
    vote: '처형 투표 시간',
    tieSpeech: '동시 발언 시간',
    revote: '재투표 시간',
    finalPlea: '최후의 변론 시간',
    goodSkills: '선 진영 스킬 시간',
    evilDiscussion: '악 진영 토론 시간',
    evilVote: '악 진영 처치 투표 시간',
    evilSkills: '악 진영 개별 스킬 시간',
    grudge: '피 맺힌 유서 대상 선택 시간',
    succession: '방울 승계 선택 시간',
  };
  return labels[prefix] ?? phaseKey;
}

/** 플레이어 목록 등 좁은 공간용 닉네임 축약: 4글자 초과 시 "..."으로 표시 (예: "불닭볶음...") */
export function truncateName(name: string, max = 4): string {
  return name.length > max ? `${name.slice(0, max)}...` : name;
}
