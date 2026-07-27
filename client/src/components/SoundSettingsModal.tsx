/**
 * 음향 설정 모달 — 로비 메뉴에서 여는 배경음악 음량 조절.
 * 로그인 직후(게임 시작 전)에도 열 수 있어야 하므로 MyPage와 무관하게
 * gameStore.bgmVolume을 직접 구독한다 (게임 화면의 마이페이지 슬라이더와 상태 공유).
 */

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getSfxVolume, playSfx, setSfxVolume } from '../lib/sfx';
import { CloseButton } from './CloseButton';

export function SoundSettingsModal({ onClose }: { onClose: () => void }) {
  const bgmVolume = useGameStore((s) => s.bgmVolume);
  const setBgmVolume = useGameStore((s) => s.setBgmVolume);
  const [sfxVolume, setSfxVolumeState] = useState(getSfxVolume);

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-black/70 p-4" role="dialog" aria-label="음향 설정">
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-6">
        <CloseButton onClick={onClose} />

        <h2 className="mb-4 text-center text-base font-bold text-amber-300">음향 설정</h2>

        <label className="flex w-full items-center gap-2 text-xs text-slate-300">
          <span className="shrink-0">배경음악</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(bgmVolume * 100)}
            onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
            aria-label="배경음악 음량"
            className="min-w-0 flex-1"
          />
          <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(bgmVolume * 100)}%</span>
        </label>

        {/* 밤/낮 전환·투표 시작·스킬 사용 알림음 (10번 피드백) */}
        <label className="mt-3 flex w-full items-center gap-2 text-xs text-slate-300">
          <span className="shrink-0">효과음</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(sfxVolume * 100)}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setSfxVolume(next);
              setSfxVolumeState(next);
            }}
            onPointerUp={() => playSfx('VOTE')}
            aria-label="효과음 음량"
            className="min-w-0 flex-1"
          />
          <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(sfxVolume * 100)}%</span>
        </label>
      </div>
    </div>
  );
}
