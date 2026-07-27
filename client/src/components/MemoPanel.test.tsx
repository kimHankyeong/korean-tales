import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoPanel } from './MemoPanel';
import { useGameStore } from '../store/gameStore';

afterEach(() => {
  cleanup();
  useGameStore.setState({ memoLines: [] });
});

describe('메모장 (10번 피드백)', () => {
  it('평소에는 닫혀 있다가, 버튼을 누르면 열린다', () => {
    render(<MemoPanel onSendLine={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: '메모장' })).toBeNull();
    fireEvent.click(screen.getByLabelText('메모장'));
    expect(screen.getByRole('dialog', { name: '메모장' })).toBeTruthy();
  });

  it('문장을 입력해 추가하면 목록에 쌓이고, 서버로는 전송되지 않는다(순수 클라이언트 상태)', () => {
    render(<MemoPanel onSendLine={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    const input = screen.getByLabelText('메모 입력') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3번 해태 의심' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByText('3번 해태 의심')).toBeTruthy();
    expect(input.value).toBe(''); // 입력창 비움
    expect(useGameStore.getState().memoLines).toEqual(['3번 해태 의심']);
  });

  it('"보내기" 버튼을 누르면 그 줄만 onSendLine으로 전달된다', () => {
    useGameStore.setState({ memoLines: ['첫째 줄', '둘째 줄'] });
    const onSendLine = vi.fn();
    render(<MemoPanel onSendLine={onSendLine} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    fireEvent.click(screen.getByLabelText('"둘째 줄" 채팅으로 보내기'));
    expect(onSendLine).toHaveBeenCalledWith('둘째 줄');
    expect(onSendLine).toHaveBeenCalledTimes(1);
    // 보내도 메모에서 지워지지 않는다 — 재사용 가능
    expect(useGameStore.getState().memoLines).toEqual(['첫째 줄', '둘째 줄']);
  });

  it('삭제 버튼으로 개별 메모를 지울 수 있다', () => {
    useGameStore.setState({ memoLines: ['지울 메모'] });
    render(<MemoPanel onSendLine={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    fireEvent.click(screen.getByLabelText('"지울 메모" 메모 삭제'));
    expect(useGameStore.getState().memoLines).toEqual([]);
  });

  it('"수정" 버튼으로 기존 메모 내용을 고칠 수 있다', () => {
    useGameStore.setState({ memoLines: ['원래 문장'] });
    render(<MemoPanel onSendLine={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    fireEvent.click(screen.getByLabelText('"원래 문장" 메모 수정하기'));

    const editInput = screen.getByLabelText('"원래 문장" 메모 수정') as HTMLInputElement;
    expect(editInput.value).toBe('원래 문장');
    fireEvent.change(editInput, { target: { value: '고친 문장' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(useGameStore.getState().memoLines).toEqual(['고친 문장']);
    expect(screen.queryByText('원래 문장')).toBeNull();
  });

  it('수정 중 "취소"를 누르면 내용이 바뀌지 않는다', () => {
    useGameStore.setState({ memoLines: ['그대로 유지'] });
    render(<MemoPanel onSendLine={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    fireEvent.click(screen.getByLabelText('"그대로 유지" 메모 수정하기'));
    fireEvent.change(screen.getByLabelText('"그대로 유지" 메모 수정'), { target: { value: '바뀔 뻔' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(useGameStore.getState().memoLines).toEqual(['그대로 유지']);
    expect(screen.getByText('그대로 유지')).toBeTruthy();
  });

  it('언제든(빈 메모 상태에서도) 기입 가능하다는 안내가 표시된다', () => {
    render(<MemoPanel onSendLine={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메모장'));
    expect(screen.getByText('아직 메모가 없어요.')).toBeTruthy();
  });
});
