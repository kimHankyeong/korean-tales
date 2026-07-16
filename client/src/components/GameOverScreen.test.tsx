import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameOverPayload, PublicPlayerState } from '@korean-tales/shared';
import { GameOverScreen } from './GameOverScreen';

afterEach(cleanup);

const players: PublicPlayerState[] = [
  { id: 'p1', name: '달래', seat: 1, alive: false, avatarUrl: null },
  { id: 'p2', name: '바우', seat: 2, alive: true, avatarUrl: null },
  { id: 'p3', name: '초롱', seat: 3, alive: true, avatarUrl: null },
];

/** 선 승리 — 악(p1) 패배·사망, 선(p2) 승리, 생존 중립(p3) 합류 */
const result: GameOverPayload = {
  winner: 'GOOD',
  roles: [
    { playerId: 'p1', characterId: 'jeoseung', faction: 'EVIL', alive: false, isWinner: false },
    { playerId: 'p2', characterId: 'haetae', faction: 'GOOD', alive: true, isWinner: true },
    { playerId: 'p3', characterId: 'baridegi', faction: 'NEUTRAL', alive: true, isWinner: true },
  ],
};

function renderScreen() {
  const onRestart = vi.fn();
  const onGoLobby = vi.fn();
  render(<GameOverScreen result={result} players={players} onRestart={onRestart} onGoLobby={onGoLobby} />);
  return { onRestart, onGoLobby };
}

describe('게임 종료 화면 (requirements 8번 + 역할 공개)', () => {
  it('승리 진영 배너가 표시된다', () => {
    renderScreen();
    expect(screen.getByText('선 진영 승리!')).toBeTruthy();
  });

  it('전체 플레이어의 캐릭터가 공개된다 (게임 중에는 비공개였던 정보)', () => {
    renderScreen();
    expect(screen.getByText('저승사자')).toBeTruthy();
    expect(screen.getByText('해태')).toBeTruthy();
    expect(screen.getByText('바리공주')).toBeTruthy();
    expect(screen.getByText('1번 달래')).toBeTruthy();
  });

  it('승자 뱃지: 승리 진영 + 생존 중립에게만 표시된다', () => {
    renderScreen();
    expect(screen.getAllByText('승리')).toHaveLength(2); // p2(선) + p3(생존 중립)
  });

  it('사망자는 "사망" 표기가 붙는다', () => {
    renderScreen();
    expect(screen.getByText(/악 진영 · 사망/)).toBeTruthy();
  });

  it('다시하기/로비로 버튼이 콜백을 호출한다', () => {
    const { onRestart, onGoLobby } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: '다시하기' }));
    fireEvent.click(screen.getByRole('button', { name: '로비로' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onGoLobby).toHaveBeenCalledTimes(1);
  });
});
