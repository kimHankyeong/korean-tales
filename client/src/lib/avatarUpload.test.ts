import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, computeCropRect, validateAvatarFile } from './avatarUpload';

describe('아바타 파일 검증 (requirements 11번 — 클라이언트측)', () => {
  it('jpg/png/webp만 허용한다', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/gif', size: 1000 })).toBe('UNSUPPORTED_TYPE');
    expect(validateAvatarFile({ type: 'application/pdf', size: 1000 })).toBe('UNSUPPORTED_TYPE');
  });

  it('2MB 초과는 거부한다', () => {
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toBe('TOO_LARGE');
  });
});

describe('정사각형 크롭 영역 계산 (computeCropRect)', () => {
  it('zoom 1 · 중앙: 짧은 변 기준 정사각형이 중앙에 놓인다', () => {
    // 가로가 긴 이미지 1000×600
    expect(computeCropRect(1000, 600, 1, 0, 0)).toEqual({ sx: 200, sy: 0, sSize: 600 });
    // 세로가 긴 이미지 600×1000
    expect(computeCropRect(600, 1000, 1, 0, 0)).toEqual({ sx: 0, sy: 200, sSize: 600 });
    // 정사각형은 그대로
    expect(computeCropRect(512, 512, 1, 0, 0)).toEqual({ sx: 0, sy: 0, sSize: 512 });
  });

  it('zoom 2: 크롭 영역이 절반 크기로 줄어든다', () => {
    const rect = computeCropRect(1000, 600, 2, 0, 0);
    expect(rect.sSize).toBe(300);
    expect(rect.sx).toBe(350); // (1000-300)/2
    expect(rect.sy).toBe(150); // (600-300)/2
  });

  it('pan: -1은 왼쪽/위 끝, 1은 오른쪽/아래 끝, 범위 밖 값은 클램프된다', () => {
    expect(computeCropRect(1000, 600, 1, -1, 0).sx).toBe(0);
    expect(computeCropRect(1000, 600, 1, 1, 0).sx).toBe(400); // 1000-600
    expect(computeCropRect(1000, 600, 1, 5, -9).sx).toBe(400); // 클램프
    expect(computeCropRect(1000, 600, 1, 5, -9).sy).toBe(0);
  });

  it('zoom 1 미만은 1로 보정된다', () => {
    expect(computeCropRect(800, 800, 0.2, 0, 0).sSize).toBe(800);
  });
});
