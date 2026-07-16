/**
 * 배경음악(BGM) — 포레 〈시칠리안느〉를 루프 재생한다.
 * - 브라우저 자동재생 정책 때문에 첫 사용자 상호작용(클릭/키 입력) 시 재생을 시작한다.
 * - 음량은 마이페이지 슬라이더로 조절하고 localStorage에 저장되어 재방문 시 유지된다.
 */

import sicilienne from '../assets/audio/sicilienne.mp3';

const STORAGE_KEY = 'korean-tales:bgm-volume';
export const DEFAULT_BGM_VOLUME = 0.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 저장된 음량 불러오기 (0~1) — 없거나 손상이면 기본값 */
export function loadBgmVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_BGM_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_BGM_VOLUME;
  } catch {
    return DEFAULT_BGM_VOLUME;
  }
}

export function saveBgmVolume(volume: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clamp01(volume)));
  } catch {
    // 저장 실패는 치명적이지 않음 (시크릿 모드 등)
  }
}

let audio: HTMLAudioElement | null = null;

/**
 * BGM 시작 — 앱 진입 시 1회 호출.
 * 자동재생이 거부되면 첫 pointerdown/keydown에서 재시도한다.
 */
export function initBgm(volume: number = loadBgmVolume()): void {
  if (audio) return; // 중복 초기화 방지 (HMR 포함)
  audio = new Audio(sicilienne);
  audio.loop = true;
  audio.volume = clamp01(volume);

  const tryPlay = () => {
    audio?.play().then(removeListeners).catch(() => {
      /* 자동재생 정책 거부 — 다음 상호작용에서 재시도 */
    });
  };
  const removeListeners = () => {
    document.removeEventListener('pointerdown', tryPlay);
    document.removeEventListener('keydown', tryPlay);
  };

  document.addEventListener('pointerdown', tryPlay);
  document.addEventListener('keydown', tryPlay);
  tryPlay();
}

/** 음량 변경 (0~1) — 재생 중 즉시 반영 + 저장 */
export function applyBgmVolume(volume: number): void {
  const v = clamp01(volume);
  if (audio) audio.volume = v;
  saveBgmVolume(v);
}
