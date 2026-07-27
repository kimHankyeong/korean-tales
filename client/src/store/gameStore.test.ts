import { afterEach, describe, expect, it } from 'vitest';
import type { PublicGameState } from '@korean-tales/shared';
import { useGameStore } from './gameStore';

const players = [
  { id: 'p1', name: '달래', seat: 1, alive: true, avatarUrl: null },
  { id: 'p2', name: '바우', seat: 2, alive: true, avatarUrl: null },
];

function baseState(overrides: Partial<PublicGameState>): PublicGameState {
  return {
    phase: 'day.discussion',
    day: 1,
    players,
    advisorId: null,
    speechDirection: 'FORWARD',
    currentSpeakerId: null,
    candidates: [],
    tieCandidates: [],
    executionTargetId: null,
    awaiting: null,
    winner: null,
    ...overrides,
  };
}

afterEach(() => {
  useGameStore.setState({ publicState: null, messages: [] });
});

describe('gameStore.applyGameState — 시스템 메시지 (11·12번 피드백)', () => {
  it('개인 발언이 끝나고 전체 토론으로 넘어가면 "전체발언시간이 시작되었습니다" 메시지가 추가된다', () => {
    useGameStore.getState().applyGameState(baseState({ phase: 'day.personalSpeech', currentSpeakerId: 'p2' }));
    useGameStore.getState().applyGameState(baseState({ phase: 'day.discussion' }));
    const texts = useGameStore.getState().messages.map((m) => m.text);
    expect(texts).toContain('전체발언시간이 시작되었습니다.');
  });

  it('최후의 발언 단계로 들어가면 "N번의 최후의 발언" 메시지가 추가된다', () => {
    useGameStore.getState().applyGameState(baseState({ phase: 'day.vote' }));
    useGameStore.getState().applyGameState(baseState({ phase: 'day.finalPlea', executionTargetId: 'p2' }));
    const texts = useGameStore.getState().messages.map((m) => m.text);
    expect(texts).toContain('2번의 최후의 발언');
  });

  it('같은 단계에 머무는 업데이트는 메시지를 중복 추가하지 않는다', () => {
    useGameStore.getState().applyGameState(baseState({ phase: 'day.finalPlea', executionTargetId: 'p2' }));
    useGameStore.getState().applyGameState(baseState({ phase: 'day.finalPlea', executionTargetId: 'p2' }));
    const count = useGameStore
      .getState()
      .messages.filter((m) => m.text === '2번의 최후의 발언').length;
    expect(count).toBe(1);
  });
});
