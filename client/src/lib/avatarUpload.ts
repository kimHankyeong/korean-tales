/**
 * 아바타 업로드 클라이언트 규칙 — requirements 11번 마이페이지.
 * 형식(jpg/png/webp)·용량(2MB)은 서버에서도 재검증되지만, 업로드 전에 먼저 걸러
 * 사용자에게 즉시 알려준다. 크롭 사각형 계산은 순수 함수로 분리해 테스트한다.
 */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** 업로드 크기 — 256×256 리사이즈 (11번 섹션) */
export const AVATAR_SIZE = 256;

export type AvatarFileError = 'UNSUPPORTED_TYPE' | 'TOO_LARGE';

export function validateAvatarFile(file: { type: string; size: number }): AvatarFileError | null {
  if (!(AVATAR_ALLOWED_TYPES as readonly string[]).includes(file.type)) return 'UNSUPPORTED_TYPE';
  if (file.size > AVATAR_MAX_BYTES) return 'TOO_LARGE';
  return null;
}

export const AVATAR_ERROR_MESSAGES: Record<AvatarFileError, string> = {
  UNSUPPORTED_TYPE: 'jpg / png / webp 형식만 업로드할 수 있어요.',
  TOO_LARGE: '사진 용량은 2MB 이하여야 해요.',
};

/** 원본 이미지에서 잘라낼 정사각형 영역 (source 좌표계) */
export interface CropRect {
  sx: number;
  sy: number;
  sSize: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 정사각형 크롭 영역 계산.
 * - zoom: 1(짧은 변에 꽉 참) ~ n배 확대
 * - panX/panY: -1(왼쪽/위 끝) ~ 1(오른쪽/아래 끝), 0 = 중앙
 */
export function computeCropRect(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  panX: number,
  panY: number,
): CropRect {
  const safeZoom = Math.max(1, zoom);
  const sSize = Math.min(naturalWidth, naturalHeight) / safeZoom;
  const maxX = naturalWidth - sSize;
  const maxY = naturalHeight - sSize;
  const sx = clamp((maxX / 2) * (1 + clamp(panX, -1, 1)), 0, maxX);
  const sy = clamp((maxY / 2) * (1 + clamp(panY, -1, 1)), 0, maxY);
  return { sx, sy, sSize };
}

/** 크롭 영역을 256×256 캔버스에 그려 Blob으로 변환 (webp 미지원 브라우저는 png 폴백) */
export function cropToBlob(
  image: CanvasImageSource,
  rect: CropRect,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('canvas 2d context unavailable'));
  context.drawImage(image, rect.sx, rect.sy, rect.sSize, rect.sSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요'))),
      'image/webp',
      0.9,
    );
  });
}
