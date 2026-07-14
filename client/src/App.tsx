/**
 * 공용 UI 데모 플레이그라운드 — 서버 연동 전, 목 데이터로 각 컴포넌트가
 * 독립적으로 동작하는지 확인하는 화면. (소켓 연동은 다음 세션)
 *
 * 좌측: 채팅창(낮/밤 표시·카운트다운·발언 순서·최후의 변론 모드)
 * 우측: 데모 제어판 — 투표 창/스킬 창/포기 포함 스킬 창 열기, 페이즈 전환 등
 */

import { useState } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { SelectionPanel, type SelectionTarget } from './components/SelectionPanel';
import { useGameStore } from './store/gameStore';

type PanelKind = 'NONE' | 'VOTE' | 'SKILL' | 'SKILL_FORGO';

export default function App() {
  const store = useGameStore();
  const [panel, setPanel] = useState<PanelKind>('NONE');
  const [nextSeat, setNextSeat] = useState(1);

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

      {/* 데모 제어판 */}
      <aside className="flex w-full shrink-0 flex-col gap-1.5 md:w-64">
        <h1 className="text-sm font-bold text-amber-300">korean_tales — 공용 UI 데모</h1>

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
