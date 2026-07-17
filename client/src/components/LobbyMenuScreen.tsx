/** 로비 메뉴 — 로그인 직후 첫 화면. 게임설명/직업 설명/게임 시작/음향 설정. */

import { useState } from 'react';
import { GameGuideModal } from './GameGuideModal';
import { SkillBookModal } from './SkillBookModal';
import { SoundSettingsModal } from './SoundSettingsModal';

export function LobbyMenuScreen({ onStart }: { onStart: () => void }) {
  const [showGuide, setShowGuide] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [showSound, setShowSound] = useState(false);

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
      </div>

      {showGuide && <GameGuideModal onClose={() => setShowGuide(false)} />}
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}
      {showSound && <SoundSettingsModal onClose={() => setShowSound(false)} />}
    </main>
  );
}
