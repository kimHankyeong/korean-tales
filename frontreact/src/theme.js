import { hexToRgba } from './utils/color';

export const APP_NAME = 'wicked in tales';
export const DEFAULT_ACCENT = '#7c5cbf';

export function buildTheme(accent = DEFAULT_ACCENT) {
  return {
    accentColor: accent,
    accentShadow: hexToRgba(accent, 0.35),

    bgBase: 'linear-gradient(180deg, #0a0e24 0%, #10163a 55%, #141c42 100%)',
    moonColor: '#efe7d6',
    moonGlowShadow: 'rgba(239,231,214,0.35)',

    mountainFar: 'linear-gradient(180deg, #212a52 0%, #191f42 100%)',
    mountainMid: 'linear-gradient(180deg, #1a2144 0%, #131936 100%)',
    mountainNear: 'linear-gradient(180deg, #0f1330 0%, #090c20 100%)',
    vignetteColor: 'rgba(5,7,18,0.6)',

    sealBorder: 'rgba(255,255,255,0.25)',
    sealText: '#f3ece1',

    textPrimary: '#f4efe6',
    textSecondary: 'rgba(244,239,230,0.75)',
    textMuted: 'rgba(244,239,230,0.45)',
    textFooter: 'rgba(244,239,230,0.32)',

    outlineBorder: 'rgba(244,239,230,0.35)',
    outlineHoverBg: 'rgba(244,239,230,0.06)',

    errorColor: '#d9776b',
    overlayBg: '#141a34',
  };
}
