import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatWindow, type ChatMessageView } from './ChatWindow';

afterEach(cleanup);

const messages: ChatMessageView[] = [
  { id: 'm1', kind: 'SYSTEM', text: '(해)낮-80초-1번' },
  { id: 'm2', kind: 'CHAT', senderName: '바우', text: '안녕하세요' },
];

function renderChat(props: Partial<Parameters<typeof ChatWindow>[0]> = {}) {
  const onSend = vi.fn();
  render(
    <ChatWindow phase="DAY" messages={messages} myId="p1" onSend={onSend} {...props} />,
  );
  return { onSend };
}

describe('채팅창 (requirements 6번 + 최후의 변론 5-5항)', () => {
  it('발언 순서 포맷 시스템 메시지와 일반 채팅이 표시된다', () => {
    renderChat();
    expect(screen.getByText('(해)낮-80초-1번')).toBeTruthy();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('바우')).toBeTruthy();
  });

  it('발신자 배정 번호가 있으면 "n번.닉네임" 형태로 표시된다', () => {
    renderChat({
      messages: [{ id: 'm3', kind: 'CHAT', senderName: '바우', senderSeat: 5, text: '안녕' }],
    });
    expect(screen.getByText('5번.바우')).toBeTruthy();
  });

  it('낮에는 "낮" 텍스트가 표시된다 (해 아이콘은 애니메이션 후 고정)', () => {
    renderChat();
    expect(screen.getByText('낮')).toBeTruthy();
  });

  it('일반 모드에서는 입력·전송이 가능하다', () => {
    const { onSend } = renderChat();
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '투표합시다' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));
    expect(onSend).toHaveBeenCalledWith('투표합시다');
    expect(input.value).toBe(''); // 전송 후 비움
  });

  it('최후의 변론 모드: 처형 대상자가 아니면 입력창이 비활성화된다', () => {
    renderChat({ condemnedId: 'p3', condemnedName: '초롱' });
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toContain('초롱');
    expect(input.placeholder).toContain('발언할 수 있습니다');
  });

  it('잠금 모드: 이유 불문 전원 입력창이 비활성화된다', () => {
    renderChat({ locked: true, lockedReason: '밤에는 채팅할 수 없어요' });
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('밤에는 채팅할 수 없어요');
  });

  it('최후의 변론 모드: 처형 대상자 본인은 입력할 수 있다', () => {
    const { onSend } = renderChat({ condemnedId: 'p1' });
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: '저는 결백합니다' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));
    expect(onSend).toHaveBeenCalledWith('저는 결백합니다');
  });

  it('악 진영 전용 채널(channel="EVIL")이면 낮 채팅과 구분되는 배지가 표시된다', () => {
    renderChat({ phase: 'NIGHT', channel: 'EVIL' });
    expect(screen.getByText('🩸 악 진영 전용 채널')).toBeTruthy();
  });

  it('일반(공개) 채널이면 악 진영 배지가 표시되지 않는다', () => {
    renderChat({ phase: 'NIGHT', channel: 'PUBLIC' });
    expect(screen.queryByText('🩸 악 진영 전용 채널')).toBeNull();
  });

  it('카운트다운 문구가 표시된다', () => {
    renderChat({
      timer: { label: '토론 시간', endsAt: Date.now() + 90_000, serverNow: Date.now() },
    });
    expect(screen.getByTestId('countdown').textContent).toMatch(/^토론 시간 \d{2}초 남음$/);
  });
});
