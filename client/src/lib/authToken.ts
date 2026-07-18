/**
 * 세션 토큰 저장 — localStorage에 유지되어 새로고침·재방문에도 로그인이 유지된다.
 * authStore.ts와 api.ts가 서로를 import하지 않도록 이 작은 모듈을 공용으로 둔다.
 */

const STORAGE_KEY = 'korean-tales:session-token';

let token: string | null = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // 시크릿 모드 등 localStorage 접근 불가 환경
  }
})();

export function getToken(): string | null {
  return token;
}

export function setToken(next: string): void {
  token = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 실패는 치명적이지 않음 — 이번 세션 동안은 메모리 값으로 계속 동작
  }
}

export function clearToken(): void {
  token = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}
