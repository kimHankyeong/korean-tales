/**
 * 채팅창 — 6번 섹션:
 * - 상단에 낮/밤 표시(해 아이콘 애니메이션 → "낮" 텍스트 옆 고정) + 카운트다운 문구
 * - 발언 순서 표시 포맷 `(해)낮-80초-1번` 을 시스템 메시지로 노출
 * - 단독 발언 모드(condemnedId): 최후의 변론·개인 발언 차례 둘 다 이 메커니즘을 공유한다 —
 *   지정된 한 사람만 입력 가능, 나머지는 입력창 비활성화(관전)
 * - 잠금 모드(locked): 밤에 악 진영이 아니면 전원 입력 불가(3번·4번 섹션)
 */

import { useEffect, useRef, useState } from 'react';
import type { PhaseKind } from '../lib/format';
import { Avatar } from './Avatar';
import { CountdownText, type CountdownTarget } from './CountdownText';
import { PhaseBadge } from './PhaseBadge';

export interface ChatMessageView {
  id: string;
  kind: 'CHAT' | 'SYSTEM';
  /** 발신자 id — 악 진영 팀원 강조 표시(teammateIds)에 사용 */
  senderId?: string;
  senderName?: string;
  /** 발신자 배정 번호 — 채팅에 "n번.닉네임" 형태로 함께 표시 */
  senderSeat?: number;
  /** 발신자 계정 프로필 사진 — 없으면 기본 아바타 (requirements 11번 게임 내 연동) */
  senderAvatarUrl?: string | null;
  text: string;
}

export interface ChatWindowProps {
  phase: PhaseKind;
  messages: ChatMessageView[];
  myId: string;
  /**
   * 단독 발언 모드 — 값이 있으면 해당 플레이어만 입력 가능. 최후의 변론(5-5항)과
   * 개인 발언 차례(7번 섹션) 둘 다 이 메커니즘을 공유한다.
   * null이면 일반 모드(전원 입력 가능 — 발언권 세부 제한은 서버가 판정).
   */
  condemnedId?: string | null;
  condemnedName?: string;
  /** true면 이유 불문 전원 입력 불가 (밤에 악 진영이 아닌 경우 등) */
  locked?: boolean;
  lockedReason?: string;
  /**
   * 지금 이 창이 전송하는 채팅 채널 — 'EVIL'이면 낮 공개 채팅과 헷갈리지 않도록
   * 헤더·테두리에 별도 표시를 준다(3·4번 섹션: 악 진영 전용 채널).
   */
  channel?: 'PUBLIC' | 'EVIL';
  /** 서버 타이머 동기화 값 — 없으면 카운트다운 미표시 */
  timer?: CountdownTarget | null;
  /** 악 진영 본인에게만 채워지는 팀원 id 목록 — 채팅에서도 닉네임을 빨갛게 강조한다(3번 피드백) */
  teammateIds?: string[];
  onSend: (text: string) => void;
}

export function ChatWindow({
  phase,
  messages,
  myId,
  condemnedId = null,
  condemnedName,
  locked = false,
  lockedReason,
  channel = 'PUBLIC',
  timer = null,
  teammateIds,
  onSend,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 맨 아래로 (scrollTop 대입 — jsdom 호환)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const soloMode = condemnedId !== null;
  const canType = !locked && (!soloMode || condemnedId === myId);
  const evilChannel = channel === 'EVIL';

  const placeholder = locked
    ? (lockedReason ?? '지금은 채팅할 수 없습니다')
    : canType
      ? soloMode
        ? '메시지를 입력하세요… (Skip으로 조기 종료 가능)'
        : '메시지를 입력하세요…'
      : `${condemnedName ?? '해당 플레이어'}님만 지금 발언할 수 있습니다`;

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canType) return;
    onSend(text);
    setDraft('');
  }

  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-xl border bg-slate-900 ${
        evilChannel ? 'border-red-800/70 ring-1 ring-red-900/40' : 'border-slate-700'
      }`}
      aria-label={evilChannel ? '악 진영 전용 채팅창' : '채팅창'}
    >
      {/* 헤더: 낮/밤 배지 + (밤이면) 악 진영 전용 채널 표시 + 카운트다운 */}
      <header
        className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${
          evilChannel ? 'border-red-900/50 bg-red-950/20' : 'border-slate-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <PhaseBadge phase={phase} />
          {evilChannel && (
            <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-[11px] font-bold text-red-200">
              🩸 악 진영 전용 채널
            </span>
          )}
        </div>
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
            <p key={m.id} className="flex items-start gap-1.5 text-sm leading-snug">
              <Avatar name={m.senderName ?? '?'} url={m.senderAvatarUrl} size={20} />
              <span>
                <span
                  className={`mr-1.5 font-semibold ${
                    m.senderId && teammateIds?.includes(m.senderId) ? 'text-red-400' : 'text-sky-300'
                  }`}
                >
                  {m.senderSeat != null ? `${m.senderSeat}번.${m.senderName}` : m.senderName}
                </span>
                <span className="text-slate-100">{m.text}</span>
              </span>
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
