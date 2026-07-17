/**
 * 서버 REST 클라이언트 — httpOnly 세션 쿠키 기반이라 모든 요청에 credentials를 포함한다.
 */

import { SERVER_URL } from './serverUrl';

export interface ProfileUser {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
}

/** 서버 상대 경로(/uploads/...)를 절대 URL로 변환 — 절대 URL은 그대로 통과 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${SERVER_URL}${url}` : url;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SERVER_URL}${path}`, { credentials: 'include', ...init });
}

export async function fetchMe(): Promise<ProfileUser | null> {
  const response = await request('/auth/me');
  if (!response.ok) return null;
  return ((await response.json()) as { user: ProfileUser }).user;
}

export async function signup(input: {
  email: string;
  password: string;
  nickname: string;
}): Promise<{ ok: true; user: ProfileUser } | { ok: false; error: string }> {
  const response = await request('/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { user?: ProfileUser; error?: string };
  return response.ok && body.user
    ? { ok: true, user: body.user }
    : { ok: false, error: body.error ?? 'UNKNOWN' };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: ProfileUser } | { ok: false; error: string }> {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { user?: ProfileUser; error?: string };
  return response.ok && body.user
    ? { ok: true, user: body.user }
    : { ok: false, error: body.error ?? 'UNKNOWN' };
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function updateNickname(
  nickname: string,
): Promise<{ ok: true; user: ProfileUser } | { ok: false; error: string }> {
  const response = await request('/profile/nickname', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const body = (await response.json()) as { user?: ProfileUser; error?: string };
  return response.ok && body.user
    ? { ok: true, user: body.user }
    : { ok: false, error: body.error ?? 'UNKNOWN' };
}

/** 크롭·리사이즈된 이미지 Blob을 raw 바디로 업로드 */
export async function uploadAvatar(
  blob: Blob,
): Promise<{ ok: true; user: ProfileUser } | { ok: false; error: string }> {
  const response = await request('/profile/avatar', {
    method: 'POST',
    headers: { 'content-type': blob.type },
    body: blob,
  });
  const body = (await response.json()) as { user?: ProfileUser; error?: string };
  return response.ok && body.user
    ? { ok: true, user: body.user }
    : { ok: false, error: body.error ?? 'UNKNOWN' };
}
