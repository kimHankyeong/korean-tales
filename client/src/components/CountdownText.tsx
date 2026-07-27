/**
 * 카운트다운 문구 — 6번 섹션: `토론 시간 00초 남음` / `개인 발언 시간 00초 남음`.
 * 서버 권위 타이머(timer:sync)의 endsAt/serverNow를 받아 클라이언트 시계를 보정해 표시만 한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { formatCountdown, friendlyTimerLabel } from '../lib/format';

export interface CountdownTarget {
  /**
   * 서버 timer:sync의 원본 phaseKey(예: "evilDiscussion:3", "appeal:p5") — gamePrompts.ts가
   * 현재 발언자 판별 등에 원본 값 그대로 쓰므로 여기서는 가공하지 않는다. 화면 표시용 한글
   * 라벨 변환은 friendlyTimerLabel()이 렌더링 시점에 담당한다.
   */
  label: string;
  /** 서버 기준 만료 시각 (epoch ms) */
  endsAt: number;
  /** 수신 시점의 서버 시각 — 클라이언트 시계 보정용 (없으면 로컬 시계 사용) */
  serverNow?: number;
}

export function CountdownText({ target }: { target: CountdownTarget }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [target]);

  // 서버-클라이언트 시계 오차 보정: 타이머(target)마다 수신 시점 기준 오프셋을 고정 적용
  const offset = useMemo(
    () => (target.serverNow !== undefined ? target.serverNow - Date.now() : 0),
    [target],
  );
  const secondsLeft = (target.endsAt - (Date.now() + offset)) / 1000;

  return (
    <span className="tabular-nums text-xs text-amber-300" data-testid="countdown">
      {formatCountdown(friendlyTimerLabel(target.label), secondsLeft)}
    </span>
  );
}
