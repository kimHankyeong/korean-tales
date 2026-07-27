import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn(() => this);
}

class FakeOscillator {
  type = '';
  frequency = { value: 0 };
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn(() => new FakeGain());
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  resume = vi.fn();
}

describe('sfx (10번 피드백 — 효과음)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    // @ts-expect-error 테스트 전용 정리
    delete window.AudioContext;
  });

  it('AudioContext가 없으면 조용히 무시한다 (예외 없음)', async () => {
    // @ts-expect-error 테스트 전용 제거
    delete window.AudioContext;
    const { playSfx } = await import('./sfx');
    expect(() => playSfx('NIGHT')).not.toThrow();
  });

  it('AudioContext가 있으면 톤 개수만큼 오실레이터를 생성해 재생한다', async () => {
    const { playSfx } = await import('./sfx');
    const ctxInstance = new FakeAudioContext();
    (window as unknown as { AudioContext: () => FakeAudioContext }).AudioContext = vi.fn(
      () => ctxInstance,
    ) as unknown as () => FakeAudioContext;

    playSfx('SKILL'); // TONES.SKILL = [880, 1046] — 2개
    expect(ctxInstance.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('음량을 0으로 설정하면 재생을 건너뛴다', async () => {
    const { playSfx, setSfxVolume } = await import('./sfx');
    setSfxVolume(0);
    const ctxInstance = new FakeAudioContext();
    (window as unknown as { AudioContext: () => FakeAudioContext }).AudioContext = vi.fn(
      () => ctxInstance,
    ) as unknown as () => FakeAudioContext;

    playSfx('VOTE');
    expect(ctxInstance.createOscillator).not.toHaveBeenCalled();
  });

  it('설정한 음량은 localStorage에 저장되어 다음 로드 시에도 유지된다', async () => {
    const { setSfxVolume } = await import('./sfx');
    setSfxVolume(0.75);
    vi.resetModules();
    const { getSfxVolume } = await import('./sfx');
    expect(getSfxVolume()).toBeCloseTo(0.75);
  });
});
