/**
 * 로그인/회원가입 화면 — requirements 11번(계정) · 9번(REQUIRE_AUTH=true, 게스트 차단).
 */

import { useState } from 'react';
import { login, signup } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: '올바른 이메일 형식이 아니에요.',
  WEAK_PASSWORD: '비밀번호는 8자 이상이어야 해요.',
  INVALID_NICKNAME: '닉네임은 2~12자여야 해요.',
  EMAIL_TAKEN: '이미 가입된 이메일이에요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않아요.',
};
const UNKNOWN_ERROR_MESSAGE = '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.';

export function AuthScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result =
      mode === 'LOGIN' ? await login({ email, password }) : await signup({ email, password, nickname });
    setBusy(false);
    if (result.ok) {
      signIn(result.user, result.token);
    } else {
      setError(ERROR_MESSAGES[result.error] ?? UNKNOWN_ERROR_MESSAGE);
    }
  }

  return (
    <main className="grid h-screen place-items-center bg-slate-950 p-4 text-slate-100">
      <form
        onSubmit={(e) => void submit(e)}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        <h1 className="text-center text-lg font-bold text-amber-300">korean_tales</h1>

        <div className="flex rounded-lg border border-slate-600 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode('LOGIN')}
            className={`flex-1 rounded-md py-1.5 font-semibold ${mode === 'LOGIN' ? 'bg-amber-600 text-white' : 'text-slate-300'}`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setMode('SIGNUP')}
            className={`flex-1 rounded-md py-1.5 font-semibold ${mode === 'SIGNUP' ? 'bg-amber-600 text-white' : 'text-slate-300'}`}
          >
            회원가입
          </button>
        </div>

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          aria-label="이메일"
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          aria-label="비밀번호"
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        {mode === 'SIGNUP' && (
          <input
            type="text"
            required
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (2~12자)"
            maxLength={12}
            aria-label="닉네임"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        )}

        {error && (
          <p role="alert" className="text-center text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-600 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === 'LOGIN' ? '로그인' : '회원가입'}
        </button>
      </form>
    </main>
  );
}
