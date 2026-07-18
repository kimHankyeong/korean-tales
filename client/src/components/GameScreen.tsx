/**
 * 실제 게임 화면 — 소켓 이벤트를 gameStore에 반영하고, resolveActivePrompt로 결정된
 * 행동 프롬프트(투표/스킬 등)를 기존 SelectionPanel 등 데모 컴포넌트로 그대로 렌더링한다.
 */

import { useEffect, useState } from 'react';
import { CHARACTER_BY_ID, FACTION_META, SOCKET_EVENTS, type ClientGameAction } from '@korean-tales/shared';
import * as api from '../lib/api';
import { resolveActivePrompt } from '../lib/gamePrompts';
import { emitWithAck, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';
import { AdminPuppetPanel } from './AdminPuppetPanel';
import { AnnouncementToast } from './AnnouncementToast';
import { ChatWindow } from './ChatWindow';
import { GameOverScreen } from './GameOverScreen';
import { MyPage } from './MyPage';
import { PlayerListPanel } from './PlayerListPanel';
import { SelectionPanel, type SelectionTarget } from './SelectionPanel';
import { ServerWakeNotice } from './ServerWakeNotice';
import { SkillBookModal } from './SkillBookModal';
import { SoundSettingsModal } from './SoundSettingsModal';

function sendAction(action: ClientGameAction) {
  void emitWithAck(SOCKET_EVENTS.gameAction, action);
}

function sendPuppetAction(playerId: string, action: ClientGameAction) {
  void emitWithAck(SOCKET_EVENTS.adminPuppetAction, { playerId, action });
}

export function GameScreen() {
  const user = useAuthStore((s) => s.user);
  const store = useGameStore();
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [flowerMode, setFlowerMode] = useState<'REVIVE' | 'DOOM' | null>(null);
  const [surrenderBusy, setSurrenderBusy] = useState(false);
  const [surrenderError, setSurrenderError] = useState<string | null>(null);
  const [showSound, setShowSound] = useState(false);
  // Skip/단발성 버튼 프롬프트 클릭 피드백 — 눌렀는지 눈에 보이게(채도 낮춤).
  // 새 발언 차례·페이즈가 오면 다시 누를 수 있어야 하므로 그 시점에 초기화한다.
  const [actedOnPrompt, setActedOnPrompt] = useState(false);
  useEffect(() => {
    setActedOnPrompt(false);
  }, [store.publicState?.phase, store.publicState?.currentSpeakerId, store.publicState?.executionTargetId]);

  // 로비 → 게임 진입 시 1회: 데모 잔여 상태 정리 + 계정 프로필 반영
  useEffect(() => {
    if (!user) return;
    store.resetForRealGame();
    // 방/게임의 플레이어 id는 계정 id가 아니라 소켓 id다(server registerHandlers.ts) —
    // 계정 id로 비교하면 currentSpeakerId 등과 절대 일치하지 않는다.
    store.setMyId(getSocket().id ?? '');
    store.setMyProfile({ nickname: user.nickname, profileImageUrl: user.profileImageUrl });
    // 발언 순서 안내 문구(예: "(해)낮-80초-1번")에 방 옵션 반영
    const personalSpeechSeconds = useRoomStore.getState().room?.settings.personalSpeechSeconds;
    if (personalSpeechSeconds) useGameStore.setState({ personalSpeechSeconds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 게임 이벤트(game:role 등) 구독은 AppRouter.tsx에서 항상 마운트된 상태로 처리한다 —
  // game:role이 room:state보다 먼저 도착하는데, GameScreen은 room:state 수신 후에야
  // 마운트되므로 여기서 구독하면 그 첫 game:role을 놓친다(직업 확인 불가 버그의 원인).

  // 다시하기 — 방은 나가지 않고 결과 화면만 닫는다. 서버가 게임 종료 시 방을 자동 비공개
  // 전환 + 전원 준비 초기화해두므로, AppRouter가 곧바로 같은 방의 준비 화면을 보여준다.
  function restartSameRoom() {
    useGameStore.setState({ gameOverResult: null });
  }

  async function agreeSurrenderClick() {
    setSurrenderBusy(true);
    setSurrenderError(null);
    const ack = await emitWithAck<{ ok: boolean; error?: string }>(SOCKET_EVENTS.surrenderAgree);
    setSurrenderBusy(false);
    if (!ack.ok) setSurrenderError(ack.error ?? '투항에 실패했어요. 다시 눌러주세요.');
  }

  function goLobby() {
    useGameStore.setState({ gameOverResult: null });
    getSocket().emit(SOCKET_EVENTS.roomLeave);
    leaveRoom();
  }

  const prompt = store.publicState
    ? resolveActivePrompt(store.publicState, store.role, store.myId, store.timer?.label ?? null)
    : null;
  const advisorDirectionActive =
    store.publicState?.phase === 'day.flowerDecision' && store.publicState.advisorId === store.myId;

  // 밤에는 전체 공개 채팅이 없다 — 악 진영은 전용 채널로, 그 외는 채팅창 자체를 잠근다 (3번·4번 섹션)
  const isNight = store.phase === 'NIGHT';
  const isEvil = store.role?.faction === 'EVIL';
  const chatLocked = isNight && !isEvil;

  return (
    <main className="flex h-screen flex-col gap-3 overflow-y-auto bg-slate-950 p-4 text-slate-100 landscape:flex-row landscape:overflow-hidden md:flex-row">
      <ServerWakeNotice />
      <AnnouncementToast />

      <div className="fixed right-4 top-4 z-50 flex gap-1.5">
        <button
          type="button"
          onClick={() => setShowSkillBook(true)}
          className="rounded-full border border-amber-500/50 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-amber-300 shadow-lg hover:bg-slate-800"
        >
          직업 설명
        </button>
        <button
          type="button"
          onClick={() => setShowSound(true)}
          aria-label="음향 설정"
          className="rounded-full border border-slate-500 bg-slate-900/90 px-3 py-1.5 text-xs shadow-lg hover:bg-slate-800"
        >
          🔊
        </button>
      </div>
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}
      {showSound && <SoundSettingsModal onClose={() => setShowSound(false)} />}

      <div className="min-h-0 flex-1">
        <ChatWindow
          phase={store.phase}
          messages={store.messages}
          myId={store.myId}
          condemnedId={store.condemnedId}
          condemnedName={store.players.find((p) => p.id === store.condemnedId)?.name}
          locked={chatLocked}
          lockedReason="밤에는 채팅할 수 없어요 (악 진영은 전용 채널로 대화해요)"
          channel={isNight && isEvil ? 'EVIL' : 'PUBLIC'}
          timer={store.timer}
          onSend={(text) =>
            void emitWithAck(SOCKET_EVENTS.chatSend, { channel: isNight ? 'EVIL' : 'PUBLIC', text })
          }
        />
      </div>

      <PlayerListPanel players={store.players} myId={store.myId} />

      <AdminPuppetPanel
        roster={store.adminRoster}
        publicState={store.publicState}
        timerPhaseKey={store.timer?.label ?? null}
        flowerOptions={store.flowerOptions}
        onSubmit={sendPuppetAction}
      />

      <aside className="flex w-full shrink-0 flex-col gap-1.5 overflow-y-auto landscape:w-56 landscape:min-w-48 md:w-64">
        <button
          type="button"
          onClick={() => setShowMyPage(true)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700/60"
        >
          마이페이지 열기
        </button>

        {store.role && (
          <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200">
            당신은 <b className="text-amber-300">{CHARACTER_BY_ID[store.role.characterId].name}</b>
            {' ('}
            {FACTION_META[store.role.faction].label}
            {')'}입니다
          </p>
        )}

        {store.publicState?.winner === null && (
          <button
            type="button"
            disabled={surrenderBusy}
            onClick={() => void agreeSurrenderClick()}
            className="rounded-lg border border-red-700/60 px-3 py-1.5 text-left text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
          >
            투항 동의
          </button>
        )}
        {surrenderError && (
          <p role="alert" className="text-xs text-red-400">
            {surrenderError}
          </p>
        )}
        {store.surrenderProgress?.status === 'IN_PROGRESS' && (
          <p className="text-xs text-amber-300">
            투항 진행 중 — {store.surrenderProgress.agreed.length}/{store.surrenderProgress.required.length}명 동의
          </p>
        )}
      </aside>

      {/* 조언자 발언 방향 결정 — 자청비 꽃 단계와 동시에 뜰 수 있음 */}
      {advisorDirectionActive && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => sendAction({ type: 'ADVISOR_DIRECTION', direction: 'FORWARD' })}
            className="pointer-events-auto rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-white"
          >
            발언 순서: 정순
          </button>
          <button
            type="button"
            onClick={() => sendAction({ type: 'ADVISOR_DIRECTION', direction: 'REVERSE' })}
            className="pointer-events-auto rounded-lg border border-amber-500 px-4 py-1.5 text-sm font-bold text-amber-300"
          >
            발언 순서: 역순
          </button>
        </div>
      )}

      {/* 행동 프롬프트 */}
      {prompt?.kind === 'SELECT' && (
        <SelectionPanel
          title={prompt.title}
          buttonLabel={prompt.buttonLabel}
          allowAbstain={prompt.allowAbstain}
          allowForgo={prompt.allowForgo}
          disabledIds={prompt.excludeSelf ? [store.myId] : []}
          players={prompt.candidateIds ? store.players.filter((p) => prompt.candidateIds!.includes(p.id)) : store.players}
          onConfirm={(target: SelectionTarget) => sendAction(prompt.buildAction(target))}
          onForgo={prompt.forgoAction ? () => sendAction(prompt.forgoAction!) : undefined}
        />
      )}

      {prompt?.kind === 'BUTTON' && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-end justify-items-center pb-24">
          <button
            type="button"
            disabled={actedOnPrompt}
            onClick={() => {
              sendAction(prompt.action);
              setActedOnPrompt(true);
            }}
            className="pointer-events-auto rounded-lg bg-amber-600 px-6 py-2 text-sm font-bold text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
          >
            {prompt.label}
          </button>
        </div>
      )}

      {prompt?.kind === 'SKIP' && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-end justify-items-center pb-24">
          <button
            type="button"
            disabled={actedOnPrompt}
            onClick={() => {
              sendAction({ type: 'SKIP', playerId: store.myId });
              setActedOnPrompt(true);
            }}
            className="pointer-events-auto rounded-lg border border-slate-400 bg-slate-900/90 px-6 py-2 text-sm font-bold text-slate-200 shadow-xl transition disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
          >
            {actedOnPrompt ? 'Skip 완료' : 'Skip'}
          </button>
        </div>
      )}

      {prompt?.kind === 'FLOWER' && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center">
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/95 p-4 shadow-2xl">
            {flowerMode === null ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!store.flowerOptions?.revivableTargetIds.length}
                  onClick={() => setFlowerMode('REVIVE')}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  부활꽃{!store.flowerOptions?.revivableTargetIds.length && ' (대상 없음)'}
                </button>
                <button
                  type="button"
                  onClick={() => setFlowerMode('DOOM')}
                  className="rounded-lg border border-red-600 px-4 py-1.5 text-sm font-bold text-red-300"
                >
                  멸망꽃
                </button>
                <button
                  type="button"
                  onClick={() => sendAction({ type: 'FLOWER_PASS' })}
                  className="rounded-lg border border-slate-500 px-4 py-1.5 text-sm text-slate-300"
                >
                  패스
                </button>
              </div>
            ) : (
              <SelectionPanel
                title={flowerMode === 'REVIVE' ? '부활꽃 — 되살릴 사람 (그날 밤 사망자만)' : '멸망꽃 — 처형할 사람'}
                buttonLabel="선택하기"
                players={
                  flowerMode === 'REVIVE'
                    ? store.players
                        .filter((p) => store.flowerOptions?.revivableTargetIds.includes(p.id))
                        .map((p) => ({ ...p, alive: true })) // SelectionPanel은 alive만 표시하므로 부활 대상(사망자)을 표시용으로 보정
                    : store.players
                }
                onConfirm={(target) => {
                  if (target === 'ABSTAIN') return;
                  sendAction(
                    flowerMode === 'REVIVE'
                      ? { type: 'FLOWER_REVIVE', targetId: target }
                      : { type: 'FLOWER_DOOM', targetId: target },
                  );
                  setFlowerMode(null);
                }}
              />
            )}
          </div>
        </div>
      )}

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

      {store.gameOverResult && (
        <GameOverScreen
          result={store.gameOverResult}
          players={store.players}
          onRestart={restartSameRoom}
          onGoLobby={goLobby}
        />
      )}
    </main>
  );
}
