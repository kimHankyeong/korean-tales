/**
 * 낮/밤 표시 — 6번 섹션: "해 모양 아이콘이 나타났다가 채팅창의 '낮' 텍스트 옆으로 이동/고정".
 * framer-motion layoutId FLIP으로 중앙 등장 → 배지 옆 고정 이동을 구현한다.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PhaseKind } from '../lib/format';

const INTRO_MS = 1100;

function PhaseIcon({ phase, size }: { phase: PhaseKind; size: number }) {
  return (
    <span
      role="img"
      aria-label={phase === 'DAY' ? '해' : '달'}
      style={{ fontSize: size, lineHeight: 1 }}
      className="select-none"
    >
      {phase === 'DAY' ? '☀️' : '🌙'}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: PhaseKind }) {
  const [intro, setIntro] = useState(true);

  // 페이즈가 바뀔 때마다 등장 연출 재생
  useEffect(() => {
    setIntro(true);
    const timer = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <>
      {/* 1) 화면 중앙에 크게 등장 */}
      <AnimatePresence>
        {intro && (
          <motion.div
            key={`intro-${phase}`}
            className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              layoutId="phase-icon"
              initial={{ scale: 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <PhaseIcon phase={phase} size={72} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2) 채팅창 상단의 "낮/밤" 텍스트 옆으로 이동해 고정 */}
      <div className="flex items-center gap-1.5" data-testid="phase-badge">
        {!intro && (
          <motion.div layoutId="phase-icon" transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
            <PhaseIcon phase={phase} size={18} />
          </motion.div>
        )}
        <span className="text-sm font-bold tracking-wide">{phase === 'DAY' ? '낮' : '밤'}</span>
      </div>
    </>
  );
}
