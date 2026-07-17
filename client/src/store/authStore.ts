/**
 * 계정 인증 상태 — requirements 11번. 세션 쿠키 유효성은 /auth/me로 확인한다.
 * 소켓 연결(lib/socket.ts)은 SIGNED_IN 상태가 된 뒤에만 시작해야 REQUIRE_AUTH를 통과한다.
 */

import { create } from 'zustand';
import { fetchMe, type ProfileUser } from '../lib/api';

export type AuthStatus = 'CHECKING' | 'SIGNED_OUT' | 'SIGNED_IN';

export interface AuthState {
  status: AuthStatus;
  user: ProfileUser | null;
  checkSession(): Promise<void>;
  signIn(user: ProfileUser): void;
  signOut(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'CHECKING',
  user: null,

  checkSession: async () => {
    const user = await fetchMe();
    set(user ? { status: 'SIGNED_IN', user } : { status: 'SIGNED_OUT', user: null });
  },

  signIn: (user) => set({ status: 'SIGNED_IN', user }),
  signOut: () => set({ status: 'SIGNED_OUT', user: null }),
}));
