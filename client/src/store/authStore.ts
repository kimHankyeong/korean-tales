/**
 * 계정 인증 상태 — requirements 11번. 세션 토큰 유효성은 /auth/me로 확인한다.
 * 소켓 연결(lib/socket.ts)은 SIGNED_IN 상태가 된 뒤에만 시작해야 REQUIRE_AUTH를 통과한다.
 */

import { create } from 'zustand';
import { fetchMe, type ProfileUser } from '../lib/api';
import { clearToken, getToken, setToken } from '../lib/authToken';

export type AuthStatus = 'CHECKING' | 'SIGNED_OUT' | 'SIGNED_IN';

export interface AuthState {
  status: AuthStatus;
  user: ProfileUser | null;
  checkSession(): Promise<void>;
  signIn(user: ProfileUser, token: string): void;
  signOut(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'CHECKING',
  user: null,

  checkSession: async () => {
    if (!getToken()) {
      set({ status: 'SIGNED_OUT', user: null });
      return;
    }
    const user = await fetchMe();
    if (user) {
      set({ status: 'SIGNED_IN', user });
    } else {
      clearToken(); // 만료·무효 토큰
      set({ status: 'SIGNED_OUT', user: null });
    }
  },

  signIn: (user, token) => {
    setToken(token);
    set({ status: 'SIGNED_IN', user });
  },

  signOut: () => {
    clearToken();
    set({ status: 'SIGNED_OUT', user: null });
  },
}));
