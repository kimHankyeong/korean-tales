/**
 * 실제 게임 화면 — 소켓 이벤트를 gameStore에 반영하고, resolveActivePrompt로 결정된
 * 행동 프롬프트(투표/스킬 등)를 기존 SelectionPanel 등 데모 컴포넌트로 그대로 렌더링한다.
 */

import { useEffect, useState } from 'react';
import { SOCKET_EVENTS, type ClientGameAction } from '@korean-tales/shared';
import * as api from '../lib/api';
import { initBgm } from '../lib/bgm';
import { resolveActivePrompt } from '../lib/gamePrompts';
import { emitWithAck, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';
import { ChatWindow } from './ChatWindow';
import { GameOverScreen } from './GameOverScreen';
import { MyPage } from './MyPage';
import { PlayerListPanel } from './PlayerListPanel';
import { SelectionPanel, type SelectionTarget } from './SelectionPanel';
import { ServerWakeNotice } from './ServerWakeNotice';
import { SkillBookModal } from './SkillBookModal';

function sendAction(action: ClientGameAction) {
  void emitWithAck(SOCKET_EVENTS.gameAction, action);
}

export function GameScreen() {
  const user = useAuthStore((s) => s.user);
  const store = useGameStore();
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [flowerMode, setFlowerMode] = useState<'REVIVE' | 'DOOM' | null>(null);

  useEffect(() => initBgm(useGameStore.getState().bgmVolume), []);

  // 로비 → 게임 진입 시 1회: 데모 잔여 상태 정리 + 계정 프로필 반영
  useEffect(() => {
    if (!user) return;
    store.resetForRealGame();
    store.setMyId(user.id);
    store.setMyProfile({ nickname: user.nickname, profileImageUrl: user.profileImageUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const socket = getSocket();
    const {
      applyRole,
      applyGameState,
      applyGameOver,
      applyChatMessage,
      applyTimerSync,
      clearTimer,
      applyInvestigation,
      applySurrenderProgress,
      applyFlowerOptions,
      addSystemMessage,
    } = useGameStore.getState();

    const onInvestigation: Parameters<typeof socket.on>[1] = (payload) => {
      applyInvestigation(payload);
      addSystemMessage(`투사 결과 — ${payload.result === 'EVIL' ? '악의 기운이 느껴진다' : '평범한 기운이다'}`);
    };

    socket.on(SOCKET_EVENTS.gameRole, applyRole);
    socket.on(SOCKET_EVENTS.gameState, applyGameState);
    socket.on(SOCKET_EVENTS.gameOver, applyGameOver);
    socket.on(SOCKET_EVENTS.chatMessage, applyChatMessage);
    socket.on(SOCKET_EVENTS.timerSync, applyTimerSync);
    socket.on(SOCKET_EVENTS.timerClear, clearTimer);
    socket.on(SOCKET_EVENTS.gameInvestigation, onInvestigation);
    socket.on(SOCKET_EVENTS.surrenderProgress, applySurrenderProgress);
    socket.on(SOCKET_EVENTS.gameFlowerOptions, applyFlowerOptions);

    return () => {
      socket.off(SOCKET_EVENTS.gameRole, applyRole);
      socket.off(SOCKET_EVENTS.gameState, applyGameState);
      socket.off(SOCKET_EVENTS.gameOver, applyGameOver);
      socket.off(SOCKET_EVENTS.chatMessage, applyChatMessage);
      socket.off(SOCKET_EVENTS.timerSync, applyTimerSync);
      socket.off(SOCKET_EVENTS.timerClear, clearTimer);
      socket.off(SOCKET_EVENTS.gameInvestigation, onInvestigation);
      socket.off(SOCKET_EVENTS.surrenderProgress, applySurrenderProgress);
      socket.off(SOCKET_EVENTS.gameFlowerOptions, applyFlowerOptions);
    };
  }, []);

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

  return (
    <main className="flex h-screen flex-col gap-3 bg-slate-950 p-4 text-slate-100 md:flex-row">
      <ServerWakeNotice />

      <button
        type="button"
        onClick={() => setShowSkillBook(true)}
        className="fixed right-4 top-4 z-50 rounded-full border border-amber-500/50 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-amber-300 shadow-lg hover:bg-slate-800"
      >
        직업 설명
      </button>
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}

      <div className="min-h-0 flex-1">
        <ChatWindow
          phase={store.phase}
          messages={store.messages}
          myId={store.myId}
          condemnedId={store.condemnedId}
          condemnedName={store.players.find((p) => p.id === store.condemnedId)?.name}
          timer={store.timer}
          onSend={(text) => void emitWithAck(SOCKET_EVENTS.chatSend, { text })}
        />
      </div>

      <PlayerListPanel players={store.players} />

      <aside className="flex w-full shrink-0 flex-col gap-1.5 md:w-64">
        <button
          type="button"
          onClick={() => setShowMyPage(true)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700/60"
        >
          마이페이지 열기
        </button>

        {store.publicState?.winner === null && (
          <button
            type="button"
            onClick={() => void emitWithAck(SOCKET_EVENTS.surrenderAgree)}
            className="rounded-lg border border-red-700/60 px-3 py-1.5 text-left text-sm text-red-300 hover:bg-red-900/30"
          >
            투항 동의
          </button>
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
            onClick={() => sendAction(prompt.action)}
            className="pointer-events-auto rounded-lg bg-amber-600 px-6 py-2 text-sm font-bold text-white shadow-xl"
          >
            {prompt.label}
          </button>
        </div>
      )}

      {prompt?.kind === 'SKIP' && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-end justify-items-center pb-24">
          <button
            type="button"
            onClick={() => sendAction({ type: 'SKIP', playerId: store.myId })}
            className="pointer-events-auto rounded-lg border border-slate-400 bg-slate-900/90 px-6 py-2 text-sm font-bold text-slate-200 shadow-xl"
          >
            Skip
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
          onClose={() => setShowMyPage(false)}
        />
      )}

      {store.gameOverResult && (
        <GameOverScreen
          result={store.gameOverResult}
          players={store.players}
          onRestart={goLobby}
          onGoLobby={goLobby}
        />
      )}
    </main>
  );
}
