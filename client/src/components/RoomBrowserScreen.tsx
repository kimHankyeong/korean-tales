/**
 * 공개방 목록 — 로비 메뉴의 "게임 시작"에서 진입. 모집 중(비공개 아님·정원 미달·미시작)인
 * 방만 조회된다. 실시간 push는 아니고, 진입 시 + 새로고침 버튼 + 화면이 떠 있는 동안의
 * 가벼운 주기적 폴링(4초)으로 갱신한다 — 다른 사람이 방금 만든 방이 안 보인다는 피드백 반영.
 */

import { useEffect, useState } from 'react';
import { SOCKET_EVENTS, type RoomStatePayload, type RoomSummary } from '@korean-tales/shared';
import { emitWithAck } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';
import { BackButton } from './BackButton';

interface ListAck {
  ok: boolean;
  rooms?: RoomSummary[];
}

interface RoomAck {
  ok: boolean;
  error?: string;
  room?: RoomStatePayload;
}

export function RoomBrowserScreen({ onBack }: { onBack: () => void }) {
  const applyRoomState = useRoomStore((s) => s.applyRoomState);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    const ack = await emitWithAck<ListAck>(SOCKET_EVENTS.roomList);
    setLoading(false);
    setRooms(ack.rooms ?? []);
  }

  useEffect(() => {
    void refresh();
    // 4초 간격 자동 갱신 — 로딩 스피너 없이 조용히 목록만 교체
    const interval = setInterval(() => {
      void emitWithAck<ListAck>(SOCKET_EVENTS.roomList).then((ack) => setRooms(ack.rooms ?? []));
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoom() {
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomCreate, {});
    setBusy(false);
    if (ack.ok && ack.room) applyRoomState(ack.room);
    else setError(ack.error ?? '방 생성에 실패했어요.');
  }

  async function joinRoom(code: string) {
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomJoin, { code });
    setBusy(false);
    if (ack.ok && ack.room) applyRoomState(ack.room);
    else setError(ack.error ?? '입장에 실패했어요.');
  }

  return (
    <main className="flex h-screen flex-col items-center gap-4 bg-slate-950 p-4 pt-16 text-slate-100">
      <BackButton onClick={onBack} />

      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="text-lg font-bold text-amber-300">모집 중인 방</h1>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="rounded-lg border border-slate-500 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      <ul aria-label="공개방 목록" className="w-full max-w-md space-y-2">
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createRoom()}
            className="w-full rounded-lg border border-dashed border-amber-500/60 px-4 py-3 text-left text-sm font-bold text-amber-300 hover:bg-amber-950/30 disabled:opacity-50"
          >
            + 새 방 만들기
          </button>
        </li>
        {rooms.map((room) => (
          <li key={room.code}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void joinRoom(room.code)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-left text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              <span className="font-semibold text-slate-100">{room.hostName}님의 방</span>
              <span className="text-xs text-slate-400">
                {room.playerCount}/{room.mode}명
              </span>
            </button>
          </li>
        ))}
        {!loading && rooms.length === 0 && (
          <li className="rounded-lg border border-slate-800 px-4 py-3 text-center text-xs text-slate-500">
            모집 중인 방이 없어요.
          </li>
        )}
      </ul>

      <div className="flex w-full max-w-md gap-2">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="코드로 직접 입장"
          aria-label="입장 코드"
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm uppercase text-slate-100 placeholder:text-slate-500"
        />
        <button
          type="button"
          disabled={busy || !joinCode.trim()}
          onClick={() => void joinRoom(joinCode.trim().toUpperCase())}
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
    </main>
  );
}
