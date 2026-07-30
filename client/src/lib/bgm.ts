/**
 * 배경음악(BGM) — 포레 〈시칠리안느〉를 루프 재생한다.
 * - 브라우저 자동재생 정책 때문에 첫 사용자 상호작용(클릭/키 입력) 시 재생을 시작한다.
 * - 음량은 마이페이지 슬라이더로 조절하고 localStorage에 저장되어 재방문 시 유지된다.
 * - iOS(WebKit)는 <audio>.volume을 웹페이지가 조작하는 것을 의도적으로 무시한다(실기기
 *   볼륨 버튼으로만 조절하게 하려는 정책). 그래서 <audio> 엘리먼트는 항상 볼륨 1로 열어두고,
 *   Web Audio API의 GainNode를 오디오 그래프 중간에 끼워 실제 음량 조절은 그쪽에서 담당한다
 *   — sfx.ts가 이미 같은 API로 효과음을 내고 있어 iOS에서도 정상 작동하는 것과 같은 원리다.
 *   Web Audio를 지원하지 않는 아주 오래된 브라우저에서는 audio.volume으로 그냥 폴백한다.
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
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;

/** <audio> → GainNode → destination 오디오 그래프 연결 — audio가 생성된 뒤 1회만 */
function ensureGainGraph(): void {
  if (!audio || gainNode) return;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return; // Web Audio 미지원 — audio.volume 폴백으로 처리
  audioCtx = new Ctor();
  const source = audioCtx.createMediaElementSource(audio);
  gainNode = audioCtx.createGain();
  source.connect(gainNode).connect(audioCtx.destination);
}

/**
 * BGM 시작 — 앱 진입 시 1회 호출.
 * 자동재생이 거부되면 첫 pointerdown/keydown에서 재시도한다.
 */
export function initBgm(volume: number = loadBgmVolume()): void {
  if (audio) return; // 중복 초기화 방지 (HMR 포함)
  audio = new Audio(sicilienne);
  audio.loop = true;
  audio.volume = 1; // 실제 음량은 GainNode가 담당 — 엘리먼트 자체는 항상 최대로 열어둔다
  ensureGainGraph();
  applyBgmVolume(volume);

  const tryPlay = () => {
    if (audioCtx?.state === 'suspended') void audioCtx.resume();
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
  if (gainNode) {
    gainNode.gain.value = v;
  } else if (audio) {
    audio.volume = v; // Web Audio 미지원 환경 폴백
  }
  saveBgmVolume(v);
}
