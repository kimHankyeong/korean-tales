import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicPlayerState } from '@korean-tales/shared';
import { PlayerListPanel } from './PlayerListPanel';
import { useGameStore } from '../store/gameStore';

afterEach(() => {
  cleanup();
  useGameStore.setState({ suspicionMarks: {} });
});

const players: PublicPlayerState[] = [
  { id: 'p1', name: '달래', seat: 1, alive: true, avatarUrl: null },
  { id: 'p2', name: '바우', seat: 2, alive: true, avatarUrl: null },
];

describe('플레이어 목록 — 조언자 지팡이 표시', () => {
  it('생존한 조언자에게만 지팡이 아이콘이 표시된다', () => {
    render(<PlayerListPanel players={players} advisorId="p1" />);
    expect(screen.getByLabelText('조언자')).toBeTruthy();
    expect(screen.getAllByLabelText('조언자')).toHaveLength(1);
  });

  it('조언자가 사망하면 지팡이 아이콘이 사라진다', () => {
    const dead = players.map((p) => (p.id === 'p1' ? { ...p, alive: false } : p));
    render(<PlayerListPanel players={dead} advisorId="p1" />);
    expect(screen.queryByLabelText('조언자')).toBeNull();
  });

  it('조언자가 없으면(advisorId 미지정) 아무도 지팡이를 표시하지 않는다', () => {
    render(<PlayerListPanel players={players} />);
    expect(screen.queryByLabelText('조언자')).toBeNull();
  });
});

describe('플레이어 목록 — 악 진영 팀원 강조 (3번 피드백)', () => {
  it('teammateIds에 포함된 플레이어의 닉네임만 빨갛게 표시된다', () => {
    render(<PlayerListPanel players={players} teammateIds={['p2']} />);
    const p1Name = screen.getByText('달래');
    const p2Name = screen.getByText('바우');
    expect(p1Name.className).not.toContain('text-red-400');
    expect(p2Name.className).toContain('text-red-400');
  });

  it('teammateIds 미지정(선/중립 본인)이면 아무도 빨갛게 표시되지 않는다', () => {
    render(<PlayerListPanel players={players} />);
    expect(screen.getByText('달래').className).not.toContain('text-red-400');
    expect(screen.getByText('바우').className).not.toContain('text-red-400');
  });
});

describe('플레이어 목록 — 닉네임 축약 표시', () => {
  it('4글자 넘는 닉네임은 "..."으로 축약되고, 원래 이름은 화면에 없다', () => {
    render(
      <PlayerListPanel
        players={[{ id: 'p1', name: '불닭볶음면장인', seat: 1, alive: true, avatarUrl: null }]}
      />,
    );
    expect(screen.getByText('불닭볶음...')).toBeTruthy();
    expect(screen.queryByText('불닭볶음면장인')).toBeNull();
  });
});

describe('플레이어 목록 — 추측 직업 아이콘 (SuspicionMark)', () => {
  it('본인을 제외한 플레이어에게만 추측 아이콘 버튼이 표시된다', () => {
    render(<PlayerListPanel players={players} myId="p1" />);
    expect(screen.getAllByLabelText('추측한 직업 아이콘 추가')).toHaveLength(1); // p2만
  });

  it('아이콘 버튼을 누르면 입력창이 뜨고, 입력 후 확정하면 아이콘이 표시된다', () => {
    render(<PlayerListPanel players={players} myId="p1" />);
    fireEvent.click(screen.getByLabelText('추측한 직업 아이콘 추가'));
    const input = screen.getByLabelText('추측한 직업 아이콘 입력 (이모지 키보드 사용)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '🦊' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByLabelText('추측 아이콘: 🦊 (탭하여 변경)')).toBeTruthy();
  });

  it('서버로는 전송되지 않는 순수 클라이언트 상태다 — 스토어에만 저장된다', () => {
    render(<PlayerListPanel players={players} myId="p1" />);
    fireEvent.click(screen.getByLabelText('추측한 직업 아이콘 추가'));
    fireEvent.change(screen.getByLabelText('추측한 직업 아이콘 입력 (이모지 키보드 사용)'), {
      target: { value: '👻' },
    });
    fireEvent.keyDown(screen.getByLabelText('추측한 직업 아이콘 입력 (이모지 키보드 사용)'), { key: 'Enter' });
    expect(useGameStore.getState().suspicionMarks).toEqual({ p2: '👻' });
  });
});
