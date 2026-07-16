/**
 * 프로필 아바타 — 계정 프로필 사진이 있으면 이미지, 없으면 기본 아바타(이니셜 원형).
 * 플레이어 목록·투표/스킬 창·채팅·마이페이지가 공용으로 사용한다 (requirements 11번).
 */

import { resolveAssetUrl } from '../lib/api';

export interface AvatarProps {
  name: string;
  url?: string | null;
  /** 픽셀 크기 (정사각형) */
  size?: number;
}

export function Avatar({ name, url, size = 36 }: AvatarProps) {
  const resolved = resolveAssetUrl(url);
  if (resolved) {
    return (
      <img
        src={resolved}
        alt={`${name} 프로필`}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  // 기본 아바타 — 미설정 유저 (11번: "미설정 시 기본 아바타 표시")
  return (
    <span
      aria-label={`${name} 기본 아바타`}
      className="grid shrink-0 place-items-center rounded-full bg-slate-600 font-bold text-slate-100"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.charAt(0) || '?'}
    </span>
  );
}
