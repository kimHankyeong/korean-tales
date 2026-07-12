/**
 * 서버 권위 페이즈 타이머 — 한 번에 하나의 페이즈 타이머만 유지한다.
 * 실제 시간 판정은 전부 서버(setTimeout)에서 하고, 클라이언트는 표시만 한다.
 */

export class PhaseTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private currentKey: string | null = null;
  private endsAtMs = 0;

  /** 현재 진행 중인 타이머의 페이즈 키 (없으면 null) */
  get key(): string | null {
    return this.currentKey;
  }

  get endsAt(): number {
    return this.endsAtMs;
  }

  get isRunning(): boolean {
    return this.handle !== null;
  }

  /** 기존 타이머를 취소하고 새 페이즈 타이머를 시작한다 */
  start(key: string, durationMs: number, onExpire: () => void): void {
    this.cancel();
    this.currentKey = key;
    this.endsAtMs = Date.now() + durationMs;
    this.handle = setTimeout(() => {
      this.handle = null;
      this.currentKey = null;
      onExpire();
    }, durationMs);
  }

  cancel(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
    this.currentKey = null;
  }

  remainingMs(now: number = Date.now()): number {
    return this.handle !== null ? Math.max(0, this.endsAtMs - now) : 0;
  }
}
