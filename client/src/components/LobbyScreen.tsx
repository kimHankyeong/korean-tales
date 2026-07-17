/**
 * 로비 화면 — 방 생성/입장, 방장 설정 변경, 진영 선호 선택, 게임 시작.
 * requirements 1번(방 옵션) 섹션. 로그인 계정만 접속 가능(REQUIRE_AUTH)하므로
 * room:create/room:join의 name은 서버가 계정 닉네임으로 대체해 무시한다.
 */

import { useState } from 'react';
import {
  ROOM_OPTIONS,
  SOCKET_EVENTS,
  type Faction,
  type RoomSettingsPayload,
  type RoomStatePayload,
} from '@korean-tales/shared';
import { emitWithAck, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';

interface RoomAck {
  ok: boolean;
  error?: string;
  room?: RoomStatePayload;
}

const FACTION_LABEL: Record<Faction, string> = { GOOD: '선', EVIL: '악', NEUTRAL: '중립' };

export function LobbyScreen() {
  const myId = useAuthStore((s) => s.user?.id);
  const room = useRoomStore((s) => s.room);
  const applyRoomState = useRoomStore((s) => s.applyRoomState);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faction, setFaction] = useState<Faction | null>(null);

  async function createRoom() {
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomCreate, {});
    setBusy(false);
    if (ack.ok && ack.room) applyRoomState(ack.room);
    else setError(ack.error ?? '방 생성에 실패했어요.');
  }

  async function joinRoom() {
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomJoin, { code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (ack.ok && ack.room) applyRoomState(ack.room);
    else setError(ack.error ?? '입장에 실패했어요.');
  }

  async function updateSettings(patch: Partial<RoomSettingsPayload>) {
    if (!room) return;
    const settings = { ...room.settings, ...patch };
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomSettings, settings);
    if (ack.ok && ack.room) applyRoomState(ack.room);
  }

  function chooseFaction(next: Faction) {
    const value = faction === next ? null : next;
    setFaction(value);
    getSocket().emit(SOCKET_EVENTS.roomFactionPreference, { faction: value });
  }

  async function toggleReady(nextReady: boolean) {
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomReady, { ready: nextReady });
    setBusy(false);
    if (!ack.ok) setError(ack.error ?? '준비 상태를 바꿀 수 없어요.');
  }

  if (!room) {
    return (
      <main className="grid h-screen place-items-center bg-slate-950 p-4 text-slate-100">
        <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-center text-lg font-bold text-amber-300">로비</h1>

          <button
            type="button"
            disabled={busy}
            onClick={() => void createRoom()}
            className="rounded-lg bg-amber-600 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            방 만들기
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="입장 코드"
              aria-label="입장 코드"
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm uppercase text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void joinRoom()}
              className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50"
            >
              입장
            </button>
          </div>

          {error && (
            <p role="alert" className="text-center text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  const isHost = room.hostId === myId;
  const me = room.players.find((p) => p.id === myId);
  const myReady = me?.ready ?? false;
  const readyCount = room.players.filter((p) => p.ready).length;

  return (
    <main className="flex h-screen flex-col gap-4 bg-slate-950 p-4 text-slate-100 md:flex-row">
      <section className="flex-1 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h1 className="mb-1 text-sm font-bold text-amber-300">
          방 코드 <span className="tracking-widest">{room.code}</span>
        </h1>
        <p className="mb-2 text-xs text-slate-400">
          {readyCount}/{room.settings.mode}명 준비 완료 — 정원이 차고 전원 준비되면 자동 시작돼요
        </p>
        <ul aria-label="로비 플레이어 목록" className="space-y-1">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm">
              <span>{p.name}</span>
              {p.isHost && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">방장</span>}
              {p.ready && <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">준비 완료</span>}
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleReady(!myReady)}
          className={`mt-3 w-full rounded-lg py-2 text-sm font-bold disabled:opacity-50 ${
            myReady ? 'border border-emerald-500 text-emerald-300' : 'bg-amber-600 text-white'
          }`}
        >
          {myReady ? '준비 취소' : '준비하기'}
        </button>

        <p className="mt-3 mb-1 text-xs text-slate-400">진영 선호 (배정을 보장하지 않음)</p>
        <div className="flex gap-2">
          {(Object.keys(FACTION_LABEL) as Faction[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => chooseFaction(f)}
              className={`rounded-lg border px-3 py-1 text-xs ${faction === f ? 'border-amber-400 bg-amber-600/30 text-amber-200' : 'border-slate-600 text-slate-300'}`}
            >
              {FACTION_LABEL[f]}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {error}
          </p>
        )}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900 p-4 md:w-64">
        <p className="text-xs text-slate-400">인원 모드</p>
        <div className="flex gap-2">
          {ROOM_OPTIONS.playerModes.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!isHost}
              onClick={() => void updateSettings({ mode })}
              className={`flex-1 rounded-lg border py-1 text-sm ${room.settings.mode === mode ? 'border-amber-400 bg-amber-600/30' : 'border-slate-600'} disabled:opacity-50`}
            >
              {mode}인
            </button>
          ))}
        </div>

        <p className="mt-1 text-xs text-slate-400">개인 발언시간</p>
        <div className="flex gap-2">
          {ROOM_OPTIONS.personalSpeechSeconds.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!isHost}
              onClick={() => void updateSettings({ personalSpeechSeconds: s })}
              className={`flex-1 rounded-lg border py-1 text-sm ${room.settings.personalSpeechSeconds === s ? 'border-amber-400 bg-amber-600/30' : 'border-slate-600'} disabled:opacity-50`}
            >
              {s}초
            </button>
          ))}
        </div>

        <p className="mt-1 text-xs text-slate-400">전체 토론시간</p>
        <div className="flex gap-2">
          {ROOM_OPTIONS.discussionSeconds.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!isHost}
              onClick={() => void updateSettings({ discussionSeconds: s })}
              className={`flex-1 rounded-lg border py-1 text-sm ${room.settings.discussionSeconds === s ? 'border-amber-400 bg-amber-600/30' : 'border-slate-600'} disabled:opacity-50`}
            >
              {s / 60}분
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
