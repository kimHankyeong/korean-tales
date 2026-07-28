import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AdminRosterPayload, PublicGameState } from '@korean-tales/shared';
import { AdminPuppetPanel } from './AdminPuppetPanel';

afterEach(cleanup);

const roster: AdminRosterPayload['players'] = [
  { playerId: 'u1', name: '방장', isVirtual: false, characterId: 'haetae', faction: 'GOOD', seat: 1, alive: true, skillUses: {} },
  { playerId: 'virtual:1', name: '가상플레이어1', isVirtual: true, characterId: 'dokkaebi', faction: 'GOOD', seat: 2, alive: true, skillUses: {} },
  { playerId: 'virtual:2', name: '가상플레이어2', isVirtual: true, characterId: 'jeoseung', faction: 'EVIL', seat: 3, alive: true, skillUses: {} },
];

const votePhaseState: PublicGameState = {
  phase: 'day.vote',
  day: 1,
  players: [
    { id: 'u1', name: '방장', seat: 1, alive: true, avatarUrl: null },
    { id: 'virtual:1', name: '가상플레이어1', seat: 2, alive: true, avatarUrl: null },
    { id: 'virtual:2', name: '가상플레이어2', seat: 3, alive: true, avatarUrl: null },
  ],
  advisorId: null,
  speechDirection: 'FORWARD',
  currentSpeakerId: null,
  candidates: [],
  tieCandidates: [],
  executionTargetId: null,
  awaiting: null,
  winner: null,
};

describe('관리자 가상 플레이어 조작 패널 (13번)', () => {
  it('가상 플레이어가 없으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <AdminPuppetPanel
        roster={roster.filter((p) => !p.isVirtual)}
        publicState={votePhaseState}
        timerPhaseKey={null}
        flowerOptions={null}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('가상 플레이어 목록이 표시되고, 선택하면 그 플레이어 기준의 행동 프롬프트가 뜬다', () => {
    render(
      <AdminPuppetPanel
        roster={roster}
        publicState={votePhaseState}
        timerPhaseKey={null}
        flowerOptions={null}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/가상플레이어1/)).toBeTruthy();
    expect(screen.getByText(/가상플레이어2/)).toBeTruthy();

    fireEvent.click(screen.getByText('2번 가상플레이어1'));
    expect(screen.getByText('처형 투표')).toBeTruthy(); // day.vote는 SELECT 프롬프트
  });

  it('대상을 고르고 확정하면 그 가상 플레이어 명의로 VOTE 액션이 제출된다', () => {
    const onSubmit = vi.fn();
    render(
      <AdminPuppetPanel
        roster={roster}
        publicState={votePhaseState}
        timerPhaseKey={null}
        flowerOptions={null}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByText('2번 가상플레이어1')); // 조작 대상 선택
    fireEvent.click(screen.getByRole('option', { name: /3번/ })); // 투표 대상 선택
    fireEvent.click(screen.getByRole('button', { name: '투표하기' }));

    expect(onSubmit).toHaveBeenCalledWith('virtual:1', {
      type: 'VOTE',
      voterId: 'virtual:1',
      targetId: 'virtual:2',
    });
  });

  it('부활꽃 버튼과 함께 "n번을 살리시겠습니까?" 문구가 뜨고, 부활꽃을 누르면 곧바로 그 대상으로 제출된다', () => {
    const nightRoster: AdminRosterPayload['players'] = [
      { playerId: 'u1', name: '방장', isVirtual: false, characterId: 'haetae', faction: 'GOOD', seat: 1, alive: true, skillUses: {} },
      { playerId: 'virtual:1', name: '가상플레이어1', isVirtual: true, characterId: 'jacheongbi', faction: 'GOOD', seat: 2, alive: true, skillUses: {} },
      { playerId: 'virtual:2', name: '가상플레이어2', isVirtual: true, characterId: 'jeoseung', faction: 'EVIL', seat: 3, alive: true, skillUses: {} },
    ];
    const nightState: PublicGameState = { ...votePhaseState, phase: 'night.goodSkills' };
    const onSubmit = vi.fn();
    render(
      <AdminPuppetPanel
        roster={nightRoster}
        publicState={nightState}
        timerPhaseKey={null}
        flowerOptions={{ revivableTargetIds: ['virtual:2'], doomAvailable: true }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByText('2번 가상플레이어1')); // 자청비 조작 대상 선택
    expect(screen.getByText('3번을 살리시겠습니까?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '부활꽃' }));
    expect(onSubmit).toHaveBeenCalledWith('virtual:1', { type: 'FLOWER_REVIVE', targetId: 'virtual:2' });
  });

  it('죽은 가상 플레이어는 선택할 수 없다', () => {
    const deadRoster = roster.map((p) => (p.playerId === 'virtual:1' ? { ...p, alive: false } : p));
    render(
      <AdminPuppetPanel
        roster={deadRoster}
        publicState={votePhaseState}
        timerPhaseKey={null}
        flowerOptions={null}
        onSubmit={vi.fn()}
      />,
    );
    const button = screen.getByText(/가상플레이어1 \(사망\)/).closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
