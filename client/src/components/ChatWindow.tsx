/**
 * 채팅창 — 6번 섹션:
 * - 상단에 낮/밤 표시(해 아이콘 애니메이션 → "낮" 텍스트 옆 고정) + 카운트다운 문구
 * - 발언 순서 표시 포맷 `(해)낮-80초-1번` 을 시스템 메시지로 노출
 * - 최후의 변론 모드: 처형 확정자만 입력 가능, 나머지는 입력창 비활성화(관전)
 */

import { useEffect, useRef, useState } from 'react';
import type { PhaseKind } from '../lib/format';
import { CountdownText, type CountdownTarget } from './CountdownText';
import { PhaseBadge } from './PhaseBadge';

export interface ChatMessageView {
  id: string;
  kind: 'CHAT' | 'SYSTEM';
  senderName?: string;
  text: string;
}

export interface ChatWindowProps {
  phase: PhaseKind;
  messages: ChatMessageView[];
  myId: string;
  /**
   * 최후의 변론 모드 — 값이 있으면 해당 플레이어만 입력 가능 (5-5항).
   * null이면 일반 모드(전원 입력 가능 — 발언권 세부 제한은 서버가 판정).
   */
  condemnedId?: string | null;
  condemnedName?: string;
  /** 서버 타이머 동기화 값 — 없으면 카운트다운 미표시 */
  timer?: CountdownTarget | null;
  onSend: (text: string) => void;
}

export function ChatWindow({
  phase,
  messages,
  myId,
  condemnedId = null,
  condemnedName,
  timer = null,
  onSend,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 맨 아래로 (scrollTop 대입 — jsdom 호환)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const pleaMode = condemnedId !== null;
  const canType = !pleaMode || condemnedId === myId;

  const placeholder = canType
    ? pleaMode
      ? '최후의 변론을 입력하세요… (Skip으로 조기 종료 가능)'
      : '메시지를 입력하세요…'
    : `최후의 변론 중 — ${condemnedName ?? '처형 대상자'}님만 발언할 수 있습니다`;

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canType) return;
    onSend(text);
    setDraft('');
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-xl border border-slate-700 bg-slate-900"
      aria-label="채팅창"
    >
      {/* 헤더: 낮/밤 배지 + 카운트다운 */}
      <header className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <PhaseBadge phase={phase} />
        {timer && <CountdownText target={timer} />}
      </header>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2" role="log">
        {messages.map((m) =>
          m.kind === 'SYSTEM' ? (
            <p
              key={m.id}
              className="rounded bg-slate-800/80 px-2 py-1 text-center text-xs font-semibold text-amber-200"
            >
              {m.text}
            </p>
          ) : (
            <p key={m.id} className="text-sm leading-snug">
              <span className="mr-1.5 font-semibold text-sky-300">{m.senderName}</span>
              <span className="text-slate-100">{m.text}</span>
            </p>
          ),
        )}
      </div>

      {/* 입력창 — 최후의 변론 모드면 대상자 외 비활성화 */}
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-700 p-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canType}
          placeholder={placeholder}
          aria-label="채팅 입력"
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canType || draft.trim().length === 0}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </section>
  );
}
