/**
 * 실제 게임 화면 — 소켓 이벤트를 gameStore에 반영하고, resolveActivePrompt로 결정된
 * 행동 프롬프트(투표/스킬 등)를 기존 SelectionPanel 등 데모 컴포넌트로 그대로 렌더링한다.
 */

import { useEffect, useState } from 'react';
import { CHARACTER_BY_ID, FACTION_META, SOCKET_EVENTS, type ClientGameAction } from '@korean-tales/shared';
import * as api from '../lib/api';
import { resolveActivePrompt } from '../lib/gamePrompts';
import { emitWithAck, getSocket, myPlayerId } from '../lib/socket';
import { playSfx } from '../lib/sfx';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';
import { AdminPuppetPanel } from './AdminPuppetPanel';
import { ActionErrorToast } from './ActionErrorToast';
import { AnnouncementToast } from './AnnouncementToast';
import { VoteResultOverlay } from './VoteResultOverlay';
import { ChatWindow } from './ChatWindow';
import { GameOverScreen } from './GameOverScreen';
import { MemoPanel } from './MemoPanel';
import { MyPage } from './MyPage';
import { PlayerListPanel } from './PlayerListPanel';
import { SelectionPanel, type SelectionTarget } from './SelectionPanel';
import { ServerWakeNotice } from './ServerWakeNotice';
import { SkillBookModal } from './SkillBookModal';
import { SoundSettingsModal } from './SoundSettingsModal';

// 출마·투표·선택·스킬 사용 등 모든 확정 버튼에서 클릭했다는 청각 피드백을 준다(10번 피드백)
// 서버가 ACTION_REJECTED를 돌려주면(guard가 조용히 거부한 경우) 토스트로 알려준다 —
// 예전엔 이런 경우도 성공 ack만 와서 "눌렀는데 반영 안 됨"으로 보였다
function reportIfRejected(ack: { ok: boolean; error?: string }) {
  if (!ack.ok && ack.error === 'ACTION_REJECTED') {
    useGameStore.getState().setActionError('지금은 반영할 수 없어요 — 시간이 지났거나 이미 사용했을 수 있어요');
  }
}

function sendAction(action: ClientGameAction) {
  playSfx('SKILL');
  void emitWithAck<{ ok: boolean; error?: string }>(SOCKET_EVENTS.gameAction, action).then(reportIfRejected);
}

function sendPuppetAction(playerId: string, action: ClientGameAction) {
  playSfx('SKILL');
  void emitWithAck<{ ok: boolean; error?: string }>(SOCKET_EVENTS.adminPuppetAction, { playerId, action }).then(
    reportIfRejected,
  );
}

export function GameScreen() {
  const user = useAuthStore((s) => s.user);
  const store = useGameStore();
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);
  const [flowerMode, setFlowerMode] = useState<'DOOM' | null>(null);
  const [surrenderBusy, setSurrenderBusy] = useState(false);
  const [surrenderError, setSurrenderError] = useState<string | null>(null);
  // 투항 동의 버튼 연타 방지 — 1분에 한 번만 누를 수 있다
  const [surrenderCooldownUntil, setSurrenderCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (surrenderCooldownUntil <= Date.now()) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [surrenderCooldownUntil]);
  const surrenderOnCooldown = nowTick < surrenderCooldownUntil;
  const surrenderCooldownSeconds = Math.max(0, Math.ceil((surrenderCooldownUntil - nowTick) / 1000));
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
    // 로그인 유저는 계정 id(acct:<userId>)가 서버 쪽 playerId다 — myPlayerId() 참고
    store.setMyId(myPlayerId());
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
  // 대기방 채팅창도 gameStore.messages를 그대로 재사용하므로(RoomLobbyScreen 참고), 방금 끝난
  // 게임의 채팅 기록(악 진영 전용 채널 포함)이 새 대기방에 그대로 남지 않도록 함께 비운다
  function restartSameRoom() {
    useGameStore.setState({ gameOverResult: null, messages: [] });
  }

  async function agreeSurrenderClick() {
    if (surrenderOnCooldown) return;
    setSurrenderCooldownUntil(Date.now() + 60_000); // 연타 방지 — 1분에 한 번만
    setSurrenderBusy(true);
    setSurrenderError(null);
    const ack = await emitWithAck<{ ok: boolean; error?: string }>(SOCKET_EVENTS.surrenderAgree);
    setSurrenderBusy(false);
    if (!ack.ok) setSurrenderError(ack.error ?? '투항에 실패했어요. 다시 눌러주세요.');
  }

  function goLobby() {
    useGameStore.setState({ gameOverResult: null, messages: [] });
    getSocket().emit(SOCKET_EVENTS.roomLeave);
    leaveRoom();
  }

  /**
   * 인게임 중 도중에 나가기 — 게임을 지속하기 어려운 사정이 생겼을 때 사용. 생존 중이면 먼저
   * FORFEIT으로 즉시 사망 처리해 나머지 인원이 끊김 없이 계속 진행할 수 있게 하고, 이미 죽어서
   * 관전만 하던 중이었다면(사망 처리는 필요 없으므로) 곧장 나간다. 두 경우 다 room:leave로 이
   * 소켓만 방 중계에서 빠지고(room.players에는 남아 다른 사람 화면에 이름이 계속 정상 표시됨),
   * 이 클라이언트만 로컬로 로비로 돌아간다.
   */
  async function forfeitClick() {
    const alive = !!store.players.find((p) => p.id === store.myId)?.alive;
    const confirmText = alive
      ? '정말 게임을 나가시겠어요? 즉시 사망 처리되며 되돌릴 수 없어요.'
      : '정말 나가시겠어요?';
    if (!window.confirm(confirmText)) return;
    if (alive) {
      const ack = await emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.gameAction, {
        type: 'FORFEIT',
        playerId: store.myId,
      });
      if (!ack.ok) return;
    }
    getSocket().emit(SOCKET_EVENTS.roomLeave);
    leaveRoom();
  }

  const prompt = store.publicState
    ? resolveActivePrompt(store.publicState, store.role, store.myId, store.timer?.label ?? null)
    : null;
  // 조언자 발언 방향 결정은 매일 밤(night.goodSkills)에 이뤄지지만, 첫날은 그 전에 밤이
  // 없어 조언자 확정 직후(firstMorning.directionChoice)에도 별도로 선택 창을 준다
  const advisorDirectionActive =
    (store.publicState?.phase === 'night.goodSkills' ||
      store.publicState?.phase === 'firstMorning.directionChoice') &&
    store.publicState.advisorId === store.myId;

  // 밤에는 전체 공개 채팅이 없다 — 악 진영은 전용 채널로, 그 외는 채팅창 자체를 잠근다 (3번·4번 섹션)
  const isNight = store.phase === 'NIGHT';
  const isEvil = store.role?.faction === 'EVIL';
  const chatLocked = isNight && !isEvil;

  function sendChatText(text: string) {
    void emitWithAck(SOCKET_EVENTS.chatSend, { channel: isNight ? 'EVIL' : 'PUBLIC', text });
  }

  // 메모장 "채팅으로 보내기"는 본인 개인 발언 시간·전체 발언(토론) 시간, 그리고 밤중 악 진영
  // 전용 채팅창(생존한 악 진영 본인)에만 허용한다
  const myAlive = store.publicState?.players.find((p) => p.id === store.myId)?.alive ?? false;
  const memoSendAllowed =
    store.publicState?.phase === 'day.discussion' ||
    (store.publicState?.phase === 'day.personalSpeech' && store.publicState.currentSpeakerId === store.myId) ||
    (isNight && isEvil && myAlive);

  return (
    <main className="flex h-screen flex-col gap-3 overflow-y-auto bg-slate-950 p-4 text-slate-100 landscape:flex-row landscape:overflow-y-hidden max-md:landscape:overflow-x-auto md:flex-row md:overflow-x-hidden">
      <ServerWakeNotice />
      <AnnouncementToast />
      <ActionErrorToast />
      <VoteResultOverlay />

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
        <MemoPanel onSendLine={sendChatText} sendAllowed={memoSendAllowed} />
        {!store.gameOverResult && store.publicState && (
          <button
            type="button"
            onClick={() => void forfeitClick()}
            aria-label="도중에 나가기"
            title="게임을 지속하기 어려우면 여기로 나갈 수 있어요"
            className="rounded-full border border-red-700/60 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-red-300 shadow-lg hover:bg-red-950/60"
          >
            나가기
          </button>
        )}
      </div>
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}
      {showSound && <SoundSettingsModal onClose={() => setShowSound(false)} />}

      <div className="h-[50vh] shrink-0 max-md:landscape:min-w-72 max-md:landscape:shrink-0 landscape:h-auto landscape:min-h-0 landscape:flex-1 md:h-auto md:min-h-0 md:flex-1">
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
          teammateIds={store.role?.teammateIds}
          onSend={sendChatText}
        />
      </div>

      <PlayerListPanel
        players={store.players}
        myId={store.myId}
        advisorId={store.publicState?.advisorId}
        teammateIds={store.role?.teammateIds}
      />

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
            disabled={surrenderBusy || surrenderOnCooldown}
            onClick={() => void agreeSurrenderClick()}
            className="rounded-lg border border-red-700/60 px-3 py-1.5 text-left text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
          >
            {surrenderOnCooldown ? `투항 동의 (${surrenderCooldownSeconds}초 후 재시도)` : '투항 동의'}
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

      {/* 조언자 발언 방향 결정 — 자청비 꽃 단계와 동시에 뜰 수 있음. 현재 선택된 방향은
          store.publicState.speechDirection을 반영해 테두리로 강조 표시한다(제대로 눌렸는지
          확인할 방법이 없다는 피드백 반영) */}
      {advisorDirectionActive && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-1">
          <p className="pointer-events-none text-xs text-amber-200">
            현재 선택: {store.publicState?.speechDirection === 'REVERSE' ? '역순' : '정순'}
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => sendAction({ type: 'ADVISOR_DIRECTION', direction: 'FORWARD' })}
              className={`pointer-events-auto rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-white transition active:brightness-75 ${
                store.publicState?.speechDirection === 'FORWARD' ? 'ring-2 ring-white' : 'opacity-70'
              }`}
            >
              발언 순서: 정순
            </button>
            <button
              type="button"
              onClick={() => sendAction({ type: 'ADVISOR_DIRECTION', direction: 'REVERSE' })}
              className={`pointer-events-auto rounded-lg border border-amber-500 px-4 py-1.5 text-sm font-bold text-amber-300 transition active:brightness-75 ${
                store.publicState?.speechDirection === 'REVERSE' ? 'ring-2 ring-amber-300' : 'opacity-70'
              }`}
            >
              발언 순서: 역순
            </button>
          </div>
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
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-end justify-items-center pb-24">
          <button
            type="button"
            disabled={actedOnPrompt}
            onClick={() => {
              sendAction(prompt.action);
              setActedOnPrompt(true);
            }}
            className="pointer-events-auto rounded-lg bg-amber-600 px-6 py-2 text-sm font-bold text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 active:brightness-75"
          >
            {prompt.label}
          </button>
        </div>
      )}

      {prompt?.kind === 'SKIP' && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-end justify-items-center pb-24">
          <button
            type="button"
            disabled={actedOnPrompt}
            onClick={() => {
              sendAction({ type: 'SKIP', playerId: store.myId });
              setActedOnPrompt(true);
            }}
            className="pointer-events-auto rounded-lg border border-slate-400 bg-slate-900/90 px-6 py-2 text-sm font-bold text-slate-200 shadow-xl transition disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 active:brightness-75"
          >
            {actedOnPrompt ? 'Skip 완료' : 'Skip'}
          </button>
        </div>
      )}

      {prompt?.kind === 'FLOWER' && (() => {
        // 그날 밤 죽을 사람은 악 진영 투표로 정해진 희생자 한 명뿐이라 따로 고를 필요 없이,
        // 부활꽃 버튼 자체가 곧 "그 사람을 살리겠다"는 확정 클릭이 되도록 문구만 함께 보여준다
        const reviveTargetId = store.flowerOptions?.revivableTargetIds[0];
        const reviveTarget = store.players.find((p) => p.id === reviveTargetId);
        return (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center">
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/95 p-4 shadow-2xl">
            {flowerMode === null ? (
              <>
                {reviveTarget && <p className="text-sm text-amber-200">{reviveTarget.seat}번을 살리시겠습니까?</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!reviveTargetId}
                    onClick={() => reviveTargetId && sendAction({ type: 'FLOWER_REVIVE', targetId: reviveTargetId })}
                    className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 active:brightness-75"
                  >
                    부활꽃{!reviveTargetId && ' (대상 없음)'}
                  </button>
                  <button
                    type="button"
                    disabled={!store.flowerOptions?.doomAvailable}
                    onClick={() => setFlowerMode('DOOM')}
                    className="rounded-lg border border-red-600 px-4 py-1.5 text-sm font-bold text-red-300 transition disabled:cursor-not-allowed disabled:opacity-40 active:brightness-75"
                  >
                    멸망꽃{!store.flowerOptions?.doomAvailable && ' (사용 불가)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendAction({ type: 'FLOWER_PASS' })}
                    className="rounded-lg border border-slate-500 px-4 py-1.5 text-sm text-slate-300 transition active:brightness-75"
                  >
                    패스
                  </button>
                </div>
              </>
            ) : (
              <SelectionPanel
                title="멸망꽃으로 누구를 죽이시겠습니까?"
                buttonLabel="선택하기"
                players={store.players}
                onConfirm={(target) => {
                  if (target === 'ABSTAIN') return;
                  sendAction({ type: 'FLOWER_DOOM', targetId: target });
                  setFlowerMode(null);
                }}
              />
            )}
          </div>
        </div>
        );
      })()}

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
          onFetchMatchHistory={api.fetchMatchHistory}
          onLogout={() => {
            // 방에 속해 있었다면 먼저 명시적으로 나간다 — 소켓이 끊기는 것만 기다리면(재접속
            // 유예 로직 때문에) 로비 자리 정리가 최대 30초 지연될 수 있다
            getSocket().emit(SOCKET_EVENTS.roomLeave);
            leaveRoom();
            void api.logout();
            useAuthStore.getState().signOut();
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
