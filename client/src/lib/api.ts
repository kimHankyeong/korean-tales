/**
 * 서버 REST 클라이언트 — Bearer 토큰 기반. 세션 토큰이 있으면 모든 요청에
 * Authorization 헤더로 실어 보낸다 (쿠키를 쓰지 않는 이유는 lib/authToken.ts 참고).
 */

import type { CharacterId, Faction, PlayerMode } from '@korean-tales/shared';
import { getToken } from './authToken';
import { SERVER_URL } from './serverUrl';

export interface ProfileUser {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  /** ADMIN_EMAILS 환경변수에 이 계정이 있으면 true (13번 — 정원 미달 시작 등 관리자 전용 기능) */
  isAdmin: boolean;
}

/** 서버 상대 경로(/uploads/...)를 절대 URL로 변환 — 절대 URL은 그대로 통과 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${SERVER_URL}${url}` : url;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${SERVER_URL}${path}`, { ...init, headers });
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
}): Promise<{ ok: true; user: ProfileUser; token: string } | { ok: false; error: string }> {
  const response = await request('/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { user?: ProfileUser; token?: string; error?: string };
  return response.ok && body.user && body.token
    ? { ok: true, user: body.user, token: body.token }
    : { ok: false, error: body.error ?? 'UNKNOWN' };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: ProfileUser; token: string } | { ok: false; error: string }> {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { user?: ProfileUser; token?: string; error?: string };
  return response.ok && body.user && body.token
    ? { ok: true, user: body.user, token: body.token }
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

/** 마이페이지 최근 전적(2번 항목) 1개 — 본인 결과 + 그 판 전원(로그인 유저만)의 좌석/직업/닉네임/승패 */
export interface MatchHistoryEntry {
  gameId: string;
  playedAt: string;
  mode: PlayerMode;
  winner: Faction;
  mySeat: number;
  myCharacterId: CharacterId;
  isWinner: boolean;
  players: Array<{ seat: number; characterId: CharacterId; nickname: string; isWinner: boolean }>;
}

export async function fetchMatchHistory(): Promise<MatchHistoryEntry[]> {
  const response = await request('/profile/history');
  if (!response.ok) return [];
  return ((await response.json()) as { matches: MatchHistoryEntry[] }).matches;
}

export async function updatePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await request('/profile/password', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = (await response.json()) as { ok?: boolean; error?: string };
  return response.ok && body.ok ? { ok: true } : { ok: false, error: body.error ?? 'UNKNOWN' };
}
