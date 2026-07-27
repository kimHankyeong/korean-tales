/**
 * 방 안 화면 — 플레이어 목록·준비 토글·방장 설정·진영 선호·공개 전환.
 * requirements 1번(방 옵션) 섹션. 로그인 계정만 접속 가능(REQUIRE_AUTH)하므로
 * room:create/room:join의 name은 서버가 계정 닉네임으로 대체해 무시한다.
 */

import { useState } from 'react';
import {
  ROOM_OPTIONS,
  SOCKET_EVENTS,
  type CharacterId,
  type Faction,
  type RoomSettingsPayload,
} from '@korean-tales/shared';
import { emitWithAck, getSocket, myPlayerId } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';
import { AdminCharacterPickModal } from './AdminCharacterPickModal';
import { BackButton } from './BackButton';
import { LobbyChatBox } from './LobbyChatBox';
import { SkillBookModal } from './SkillBookModal';
import { SoundSettingsModal } from './SoundSettingsModal';

interface RoomAck {
  ok: boolean;
  error?: string;
}

const FACTION_LABEL: Record<Faction, string> = { GOOD: '선', EVIL: '악', NEUTRAL: '중립' };

export function RoomLobbyScreen() {
  // 로그인 유저는 계정 id(acct:<userId>)가 서버 쪽 playerId다 — myPlayerId() 참고
  const myId = myPlayerId();
  const room = useRoomStore((s) => s.room)!;
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faction, setFaction] = useState<Faction | null>(null);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [showCharacterPick, setShowCharacterPick] = useState(false);
  const [kickMenuFor, setKickMenuFor] = useState<string | null>(null);
  // chat:message 구독은 AppRouter.tsx가 항상 마운트된 상태로 전역 처리한다 —
  // 여기서 또 구독하면 메시지가 두 번씩 표시되는 중복 버그가 생긴다.
  const messages = useGameStore((s) => s.messages);

  async function updateSettings(patch: Partial<RoomSettingsPayload>) {
    setBusy(true);
    setError(null);
    // 렌더 클로저의 room이 아니라 최신 스토어 값을 읽어야 한다 — 그렇지 않으면 설정을
    // 연달아 클릭했을 때 나중 요청이 이전 응답 전의 값을 기준으로 앞선 변경을 덮어쓸 수 있다.
    const settings = { ...useRoomStore.getState().room!.settings, ...patch };
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomSettings, settings);
    setBusy(false);
    if (!ack.ok) setError(ack.error ?? '설정을 바꿀 수 없어요.');
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

  async function toggleVisibility() {
    await emitWithAck<RoomAck>(SOCKET_EVENTS.roomVisibility, { isPublic: !room.isPublic });
  }

  async function kickPlayer(targetId: string) {
    setKickMenuFor(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomKick, { targetId });
    if (!ack.ok) setError(ack.error ?? '강퇴할 수 없어요.');
  }

  async function startAsAdmin(characterId: CharacterId | null, fillVirtual: boolean) {
    setShowCharacterPick(false);
    setBusy(true);
    setError(null);
    const ack = await emitWithAck<RoomAck>(SOCKET_EVENTS.roomStart, {
      characterId: characterId ?? undefined,
      fillVirtual,
    });
    setBusy(false);
    if (!ack.ok) setError(ack.error ?? '게임을 시작할 수 없어요.');
  }

  function goBack() {
    getSocket().emit(SOCKET_EVENTS.roomLeave);
    leaveRoom();
  }

  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const isHost = room.hostId === myId;
  const me = room.players.find((p) => p.id === myId);
  const myReady = me?.ready ?? false;
  const readyCount = room.players.filter((p) => p.ready).length;

  return (
    <main className="flex h-screen flex-col gap-4 overflow-y-auto bg-slate-950 p-4 text-slate-100 landscape:flex-row landscape:overflow-hidden md:flex-row">
      <BackButton onClick={goBack} />

      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}
      {showSound && <SoundSettingsModal onClose={() => setShowSound(false)} />}
      {showCharacterPick && (
        <AdminCharacterPickModal
          mode={room.settings.mode}
          onPick={(characterId, fillVirtual) => void startAsAdmin(characterId, fillVirtual)}
          onClose={() => setShowCharacterPick(false)}
        />
      )}

      <section className="flex-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 pt-12 md:pt-4">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-sm font-bold text-amber-300">
            방 코드 <span className="tracking-widest">{room.code}</span>
          </h1>
          <button
            type="button"
            onClick={() => setShowSkillBook(true)}
            className="rounded-full border border-amber-500/50 bg-slate-800/90 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-slate-700"
          >
            직업 설명
          </button>
          <button
            type="button"
            onClick={() => setShowSound(true)}
            aria-label="음향 설정"
            className="rounded-full border border-slate-500 bg-slate-800/90 px-2.5 py-1 text-xs hover:bg-slate-700"
          >
            🔊
          </button>
          {isHost && (
            <button
              type="button"
              onClick={() => void toggleVisibility()}
              className="ml-auto rounded-full border border-slate-500 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
            >
              {room.isPublic ? '공개방 (클릭 시 비공개)' : '비공개방 (클릭 시 공개)'}
            </button>
          )}
        </div>
        <p className="mb-2 text-xs text-slate-400">
          {readyCount}/{room.settings.mode}명 준비 완료 — 정원이 차고 전원 준비되면 자동 시작돼요
        </p>
        <ul aria-label="로비 플레이어 목록" className="space-y-1">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm">
              <span>{p.name}</span>
              {p.isHost && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">방장</span>}
              <div className="ml-auto flex items-center gap-1.5">
                {p.ready && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    준비 완료
                  </span>
                )}
                {isHost && p.id !== myId && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setKickMenuFor(kickMenuFor === p.id ? null : p.id)}
                      aria-label={`${p.name} 관리`}
                      className="rounded-full px-1.5 py-0.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      ⋯
                    </button>
                    {kickMenuFor === p.id && (
                      <button
                        type="button"
                        onClick={() => void kickPlayer(p.id)}
                        className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg border border-red-700 bg-slate-900 px-3 py-1 text-xs text-red-300 shadow-lg hover:bg-red-900/40"
                      >
                        강퇴
                      </button>
                    )}
                  </div>
                )}
              </div>
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

        {isAdmin && isHost && room.players.length !== room.settings.mode && (
          <button
            type="button"
            disabled={busy || room.players.length === 0}
            onClick={() => setShowCharacterPick(true)}
            className="mt-2 w-full rounded-lg border border-amber-500 py-2 text-sm font-bold text-amber-300 disabled:opacity-50"
          >
            게임 시작 (관리자 — 정원 미달 허용, 직업 선택 가능)
          </button>
        )}

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

        <div className="mt-3">
          <LobbyChatBox
            messages={messages}
            onSend={(text) => void emitWithAck(SOCKET_EVENTS.chatSend, { text })}
          />
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 landscape:w-56 md:w-64">
        <p className="text-xs text-slate-400">인원 모드</p>
        <div className="flex gap-2">
          {ROOM_OPTIONS.playerModes.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!isHost || busy}
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
              disabled={!isHost || busy}
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
              disabled={!isHost || busy}
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
