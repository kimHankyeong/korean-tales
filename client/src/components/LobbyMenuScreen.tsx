/** 로비 메뉴 — 로그인 직후 첫 화면. 게임설명/직업 설명/게임 시작/음향 설정/마이페이지. */

import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { GameGuideModal } from './GameGuideModal';
import { MyPage } from './MyPage';
import { SkillBookModal } from './SkillBookModal';
import { SoundSettingsModal } from './SoundSettingsModal';

export function LobbyMenuScreen({ onStart }: { onStart: () => void }) {
  const [showGuide, setShowGuide] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);
  const store = useGameStore();
  const user = useAuthStore((s) => s.user);

  // 계정 프로필을 마이페이지가 참조하는 gameStore.myProfile에 반영
  useEffect(() => {
    if (!user) return;
    store.setMyProfile({ nickname: user.nickname, profileImageUrl: user.profileImageUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <main className="grid h-screen place-items-center bg-slate-950 p-4 text-slate-100">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="mb-2 text-center text-xl font-bold text-amber-300">korean_tales</h1>

        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="rounded-lg border border-slate-600 bg-slate-900 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          게임설명
        </button>
        <button
          type="button"
          onClick={() => setShowSkillBook(true)}
          className="rounded-lg border border-slate-600 bg-slate-900 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          직업 설명
        </button>
        <button
          type="button"
          onClick={onStart}
          className="rounded-lg bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-500"
        >
          게임 시작
        </button>
        <button
          type="button"
          onClick={() => setShowSound(true)}
          className="rounded-lg border border-slate-600 bg-slate-900 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          음향 설정
        </button>
        <button
          type="button"
          onClick={() => setShowMyPage(true)}
          className="rounded-lg border border-slate-600 bg-slate-900 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          마이페이지
        </button>
      </div>

      {showGuide && <GameGuideModal onClose={() => setShowGuide(false)} />}
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}
      {showSound && <SoundSettingsModal onClose={() => setShowSound(false)} />}
      {showMyPage && (
        <MyPage
          user={store.myProfile}
          onChangeNickname={async (nickname) => {
            if (nickname.length < 2) return '닉네임은 2자 이상이어야 해요.';
            const result = await api.updateNickname(nickname);
            if (!result.ok) return result.error;
            store.setMyNickname(result.user.nickname);
            return null;
          }}
          onUploadAvatar={async (blob) => {
            const result = await api.uploadAvatar(blob);
            if (!result.ok) return result.error;
            store.setMyAvatarUrl(api.resolveAssetUrl(result.user.profileImageUrl));
            return null;
          }}
          bgmVolume={store.bgmVolume}
          onChangeBgmVolume={store.setBgmVolume}
          onChangePassword={async (currentPassword, newPassword) => {
            const result = await api.updatePassword(currentPassword, newPassword);
            return result.ok ? null : result.error;
          }}
          onClose={() => setShowMyPage(false)}
        />
      )}
    </main>
  );
}
