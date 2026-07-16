/**
 * 공용 UI 데모 플레이그라운드 — 서버 연동 전, 목 데이터로 각 컴포넌트가
 * 독립적으로 동작하는지 확인하는 화면. (소켓 연동은 다음 세션)
 *
 * 좌측: 채팅창(낮/밤 표시·카운트다운·발언 순서·최후의 변론 모드)
 * 우측: 데모 제어판 — 투표 창/스킬 창/포기 포함 스킬 창 열기, 페이즈 전환 등
 */

import { useEffect, useState } from 'react';
import { CHARACTERS, type GameOverPayload } from '@korean-tales/shared';
import { ChatWindow } from './components/ChatWindow';
import { GameOverScreen } from './components/GameOverScreen';
import { MyPage } from './components/MyPage';
import { PlayerListPanel } from './components/PlayerListPanel';
import { SelectionPanel, type SelectionTarget } from './components/SelectionPanel';
import { ServerWakeNotice } from './components/ServerWakeNotice';
import { SkillBookModal } from './components/SkillBookModal';
import { initBgm } from './lib/bgm';
import { useGameStore } from './store/gameStore';

type PanelKind = 'NONE' | 'VOTE' | 'SKILL' | 'SKILL_FORGO';

/** 종료 화면 데모용 목 결과 — 선 승리, 악 전멸, 생존 중립 합류 */
function mockGameOver(players: { id: string; alive: boolean }[]): GameOverPayload {
  return {
    winner: 'GOOD',
    roles: players.map((p, i) => {
      const character = CHARACTERS[i % CHARACTERS.length]!;
      const alive = character.faction !== 'EVIL' && p.alive;
      return {
        playerId: p.id,
        characterId: character.id,
        faction: character.faction,
        alive,
        isWinner: character.faction === 'GOOD' || (character.faction === 'NEUTRAL' && alive),
      };
    }),
  };
}

export default function App() {
  const store = useGameStore();
  const [panel, setPanel] = useState<PanelKind>('NONE');
  const [nextSeat, setNextSeat] = useState(1);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showSkillBook, setShowSkillBook] = useState(false);

  // BGM(시칠리안느) 시작 — 자동재생이 막히면 첫 클릭에서 재생된다
  useEffect(() => initBgm(useGameStore.getState().bgmVolume), []);

  function confirmSelection(target: SelectionTarget) {
    const label =
      target === 'ABSTAIN'
        ? '기권했습니다.'
        : `${store.players.find((p) => p.id === target)?.seat}번을 대상으로 확정했습니다.`;
    store.addSystemMessage(`[${panel === 'VOTE' ? '투표' : '스킬'}] ${label}`);
    setPanel('NONE');
  }

  const controlButton =
    'rounded-lg border border-slate-600 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700/60';

  return (
    <main className="flex h-screen flex-col gap-3 bg-slate-950 p-4 text-slate-100 md:flex-row">
      {/* 무료 서버 콜드스타트 안내 — 슬립에서 깨어나는 동안만 표시 (12번 섹션) */}
      <ServerWakeNotice />

      {/* 직업 설명 버튼 — 우측 상단 고정 (6번 섹션) */}
      <button
        type="button"
        onClick={() => setShowSkillBook(true)}
        className="fixed right-4 top-4 z-50 rounded-full border border-amber-500/50 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-amber-300 shadow-lg hover:bg-slate-800"
      >
        직업 설명
      </button>
      {showSkillBook && <SkillBookModal onClose={() => setShowSkillBook(false)} />}

      {/* 채팅창 */}
      <div className="min-h-0 flex-1">
        <ChatWindow
          phase={store.phase}
          messages={store.messages}
          myId={store.myId}
          condemnedId={store.condemnedId}
          condemnedName={store.players.find((p) => p.id === store.condemnedId)?.name}
          timer={store.timer}
          onSend={store.sendChat}
        />
      </div>

      {/* 플레이어 목록 패널 — 프로필 + 배정 번호 (6번 섹션, 계정 프로필 사진 연동) */}
      <PlayerListPanel players={store.players} />

      {/* 데모 제어판 */}
      <aside className="flex w-full shrink-0 flex-col gap-1.5 md:w-64">
        <h1 className="text-sm font-bold text-amber-300">korean_tales — 공용 UI 데모</h1>

        <p className="mt-1 text-xs text-slate-400">계정</p>
        <button className={controlButton} onClick={() => setShowMyPage(true)}>
          마이페이지 열기 (닉네임 · 프로필 사진)
        </button>

        <p className="mt-1 text-xs text-slate-400">페이즈</p>
        <button className={controlButton} onClick={() => store.setPhase(store.phase === 'DAY' ? 'NIGHT' : 'DAY')}>
          {store.phase === 'DAY' ? '밤으로 전환' : '낮으로 전환'} (해/달 등장 애니메이션)
        </button>

        <p className="mt-1 text-xs text-slate-400">카운트다운 (서버 타이머 목)</p>
        <button className={controlButton} onClick={() => store.startTimer('토론 시간', 90)}>
          토론 타이머 90초 시작
        </button>
        <button className={controlButton} onClick={() => store.startTimer('개인 발언 시간', store.personalSpeechSeconds)}>
          개인 발언 타이머 시작
        </button>

        <p className="mt-1 text-xs text-slate-400">발언 순서 표시</p>
        <button
          className={controlButton}
          onClick={() => {
            store.announceSpeaker(nextSeat);
            setNextSeat((s) => (s % 9) + 1);
          }}
        >
          다음 발언자 공지 — ({store.phase === 'DAY' ? '해' : '달'}){store.phase === 'DAY' ? '낮' : '밤'}-
          {store.personalSpeechSeconds}초-{nextSeat}번
        </button>

        <p className="mt-1 text-xs text-slate-400">투표/스킬 공용 창</p>
        <button className={controlButton} onClick={() => setPanel('VOTE')}>
          투표 창 열기 (기권 포함 · "투표하기")
        </button>
        <button className={controlButton} onClick={() => setPanel('SKILL')}>
          스킬 창 열기 (해태 투사 · "선택하기")
        </button>
        <button className={controlButton} onClick={() => setPanel('SKILL_FORGO')}>
          스킬 창 열기 (장화홍련 · "스킬 포기" 포함)
        </button>

        <p className="mt-1 text-xs text-slate-400">최후의 변론 모드</p>
        <button
          className={controlButton}
          onClick={() => store.setCondemned(store.condemnedId ? null : 'p3')}
        >
          {store.condemnedId ? '변론 모드 해제' : '변론 모드 시작 (3번 초롱만 발언)'}
        </button>
        <button
          className={controlButton}
          onClick={() => store.setCondemned(store.condemnedId === store.myId ? null : store.myId)}
        >
          {store.condemnedId === store.myId ? '변론 모드 해제' : '내가 처형 대상일 때 (입력 가능)'}
        </button>

        <p className="mt-1 text-xs text-slate-400">게임 종료</p>
        <button className={controlButton} onClick={() => setGameOver(mockGameOver(store.players))}>
          종료 화면 보기 (선 승리 · 역할 공개)
        </button>
      </aside>

      {/* 공용 선택 패널 — 화면 중앙 1/6 크기 */}
      {panel === 'VOTE' && (
        <SelectionPanel
          title="처형 투표"
          players={store.players}
          buttonLabel="투표하기"
          allowAbstain
          onConfirm={confirmSelection}
        />
      )}
      {panel === 'SKILL' && (
        <SelectionPanel
          title="투사 — 조사 대상 선택"
          players={store.players}
          buttonLabel="선택하기"
          disabledIds={[store.myId]}
          onConfirm={confirmSelection}
        />
      )}
      {/* 마이페이지 — 데모에서는 목 저장 (소켓 연동 시 lib/api의 updateNickname/uploadAvatar로 교체) */}
      {showMyPage && (
        <MyPage
          user={store.myProfile}
          onChangeNickname={async (nickname) => {
            if (nickname.length < 2) return '닉네임은 2자 이상이어야 해요.';
            store.setMyNickname(nickname);
            return null;
          }}
          onUploadAvatar={async (blob) => {
            store.setMyAvatarUrl(URL.createObjectURL(blob)); // 데모: 로컬 미리보기 URL
            return null;
          }}
          bgmVolume={store.bgmVolume}
          onChangeBgmVolume={store.setBgmVolume}
          onClose={() => setShowMyPage(false)}
        />
      )}

      {/* 게임 종료 화면 — 승리 진영·역할 전체 공개·다시하기/로비로 */}
      {gameOver && (
        <GameOverScreen
          result={gameOver}
          players={store.players}
          onRestart={() => {
            setGameOver(null);
            store.addSystemMessage('[데모] 다시하기 — 새 게임 준비 (소켓 연동 시 room:start 재요청)');
          }}
          onGoLobby={() => {
            setGameOver(null);
            store.addSystemMessage('[데모] 로비로 이동 (소켓 연동 시 로비 화면 전환)');
          }}
        />
      )}

      {panel === 'SKILL_FORGO' && (
        <SelectionPanel
          title="피 맺힌 유서 — 함께 데려갈 사람"
          players={store.players}
          buttonLabel="선택하기"
          allowForgo
          disabledIds={[store.myId]}
          onConfirm={confirmSelection}
          onForgo={() => {
            useGameStore.getState().addSystemMessage('[스킬] 피 맺힌 유서를 포기했습니다.');
            setPanel('NONE');
          }}
        />
      )}
    </main>
  );
}
