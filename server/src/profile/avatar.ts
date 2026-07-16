/**
 * 아바타 이미지 검증 헬퍼 — requirements 11번 마이페이지.
 * "서버 측에서도 형식·용량 재검증 (클라이언트 검증만 믿지 않기)" —
 * Content-Type 헤더가 아니라 파일 시그니처(매직 바이트)로 실제 형식을 판별한다.
 */

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB (11번 섹션)

export type AvatarImageType = 'jpg' | 'png' | 'webp';

export const AVATAR_MIME_TYPES: Record<string, AvatarImageType> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 파일 시그니처로 실제 이미지 형식 판별 — 허용 형식이 아니면 null */
export function sniffImageType(buffer: Buffer): AvatarImageType | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** 저장 파일명 — 유저당 1개 (형식이 바뀌면 이전 확장자 파일은 삭제) */
export function avatarFileName(userId: string, type: AvatarImageType): string {
  return `${userId}.${type}`;
}

export const AVATAR_CONTENT_TYPES: Record<AvatarImageType, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
