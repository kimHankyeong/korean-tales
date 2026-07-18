/**
 * 방 대기중 채팅 — 방 안에서 게임 시작 전까지 전체 채팅. 게임이 시작되면
 * gameStore.resetForRealGame()이 메시지를 초기화하므로 별도 처리가 필요 없다.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageView } from './ChatWindow';
import { Avatar } from './Avatar';

export function LobbyChatBox({
  messages,
  onSend,
}: {
  messages: ChatMessageView[];
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <section className="flex h-48 flex-col rounded-xl border border-slate-700 bg-slate-900" aria-label="대기중 채팅">
      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2" role="log">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-500">아직 대화가 없어요.</p>
        )}
        {messages.map((m) =>
          m.kind === 'SYSTEM' ? (
            <p key={m.id} className="rounded bg-slate-800/80 px-2 py-1 text-center text-xs text-amber-200">
              {m.text}
            </p>
          ) : (
            <p key={m.id} className="flex items-start gap-1.5 text-sm leading-snug">
              <Avatar name={m.senderName ?? '?'} url={m.senderAvatarUrl} size={20} />
              <span>
                <span className="mr-1.5 font-semibold text-sky-300">{m.senderName}</span>
                <span className="text-slate-100">{m.text}</span>
              </span>
            </p>
          ),
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-700 p-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지를 입력하세요…"
          aria-label="대기중 채팅 입력"
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </section>
  );
}
