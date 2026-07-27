/**
 * 효과음(SFX) — 밤/낮 전환·투표 시작·스킬 사용 시 짧은 "띨롱" 알림음을 재생한다(10번 피드백).
 * 별도 음원 파일 없이 Web Audio API로 짧은 톤을 합성한다. BGM(lib/bgm.ts)과 마찬가지로
 * 브라우저 자동재생 정책 때문에 첫 사용자 상호작용 전에는 소리가 나지 않을 수 있다.
 * 음량은 마이페이지/음향 설정과 별도로 localStorage에 유지된다.
 */

const STORAGE_KEY = 'korean-tales:sfx-volume';
export const DEFAULT_SFX_VOLUME = 0.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function loadSfxVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SFX_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_SFX_VOLUME;
  } catch {
    return DEFAULT_SFX_VOLUME;
  }
}

function saveSfxVolume(volume: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clamp01(volume)));
  } catch {
    // 저장 실패는 치명적이지 않음 (시크릿 모드 등)
  }
}

let volume = loadSfxVolume();

export function setSfxVolume(next: number): void {
  volume = clamp01(next);
  saveSfxVolume(volume);
}

export function getSfxVolume(): number {
  return volume;
}

type AudioContextCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export type SfxKind = 'NIGHT' | 'DAY' | 'VOTE' | 'SKILL';

/** 각 상황별 음 높이(Hz) 시퀀스 — 짧게 이어지는 "띨롱" 느낌 */
const TONES: Record<SfxKind, readonly number[]> = {
  NIGHT: [440, 330],
  DAY: [523, 659],
  VOTE: [784],
  SKILL: [880, 1046],
};

const NOTE_SECONDS = 0.12;

/** 짧은 알림음 재생 — AudioContext를 지원하지 않거나 음소거면 조용히 무시한다 */
export function playSfx(kind: SfxKind): void {
  const audioCtx = ensureContext();
  if (!audioCtx || volume <= 0) return;

  TONES[kind].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const startAt = audioCtx.currentTime + i * NOTE_SECONDS;
    const endAt = startAt + NOTE_SECONDS;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume * 0.3, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  });
}
