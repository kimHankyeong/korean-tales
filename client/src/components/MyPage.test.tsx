import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyPage } from './MyPage';

afterEach(cleanup);

// jsdom에는 createObjectURL/revokeObjectURL이 없다 — 크롭 모달용 폴리필
beforeAll(() => {
  Object.assign(URL, {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  });
});

function renderMyPage(
  profileImageUrl: string | null = null,
  onFetchMatchHistory?: () => Promise<import('./MyPage').MyPageMatchHistoryEntry[]>,
) {
  const onChangeNickname = vi.fn(async () => null);
  const onUploadAvatar = vi.fn(async () => null);
  const onChangeBgmVolume = vi.fn();
  const onClose = vi.fn();
  render(
    <MyPage
      user={{ nickname: '달래', profileImageUrl }}
      onChangeNickname={onChangeNickname}
      onUploadAvatar={onUploadAvatar}
      bgmVolume={0.4}
      onChangeBgmVolume={onChangeBgmVolume}
      onFetchMatchHistory={onFetchMatchHistory}
      onClose={onClose}
    />,
  );
  return { onChangeNickname, onUploadAvatar, onChangeBgmVolume, onClose };
}

function selectFile(file: File) {
  const input = screen.getByLabelText('프로필 사진 선택') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('마이페이지 (requirements 11번)', () => {
  it('현재 닉네임과 기본 아바타가 표시된다 (사진 미설정)', () => {
    renderMyPage();
    expect((screen.getByLabelText('닉네임') as HTMLInputElement).value).toBe('달래');
    expect(screen.getByLabelText('달래 기본 아바타')).toBeTruthy();
  });

  it('프로필 사진이 설정돼 있으면 이미지로 표시된다', () => {
    renderMyPage('https://cdn.example.com/me.webp');
    const img = screen.getByAltText('달래 프로필') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.example.com/me.webp');
  });

  it('닉네임 변경 저장이 콜백을 호출하고 결과 메시지를 보여준다', async () => {
    const { onChangeNickname } = renderMyPage();
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '새달래' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onChangeNickname).toHaveBeenCalledWith('새달래'));
    expect((await screen.findByRole('status')).textContent).toContain('변경했어요');
  });

  it('배경음악 음량 슬라이더: 현재 값 표시 + 조절 시 0~1 값으로 콜백 호출', () => {
    const { onChangeBgmVolume } = renderMyPage();
    const slider = screen.getByLabelText('배경음악 음량') as HTMLInputElement;
    expect(slider.value).toBe('40'); // bgmVolume 0.4 → 40%
    expect(screen.getByText('40%')).toBeTruthy();
    fireEvent.change(slider, { target: { value: '75' } });
    expect(onChangeBgmVolume).toHaveBeenCalledWith(0.75);
  });

  it('허용되지 않는 형식·2MB 초과 파일은 크롭 없이 즉시 에러를 보여준다', () => {
    const { onUploadAvatar } = renderMyPage();

    selectFile(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(screen.getByRole('status').textContent).toContain('jpg / png / webp');

    const huge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    selectFile(huge);
    expect(screen.getByRole('status').textContent).toContain('2MB');

    expect(onUploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '프로필 사진 자르기' })).toBeNull();
  });

  it('유효한 파일을 선택하면 정사각형 크롭 UI가 열린다', () => {
    renderMyPage();
    selectFile(new File(['png-bytes'], 'me.png', { type: 'image/png' }));
    expect(screen.getByRole('dialog', { name: '프로필 사진 자르기' })).toBeTruthy();
    expect(screen.getByLabelText('확대 배율')).toBeTruthy();
  });

  it('onFetchMatchHistory 미지정 시 전적 섹션이 아예 표시되지 않는다', () => {
    renderMyPage();
    expect(screen.queryByText('최근 전적')).toBeNull();
  });

  it('마운트 시 최근 전적을 불러와 표시하고, 클릭하면 그 판의 전원이 펼쳐진다 (2번 항목)', async () => {
    const onFetchMatchHistory = vi.fn(async () => [
      {
        gameId: 'g1',
        playedAt: '2026-01-01T00:00:00.000Z',
        mode: 9 as const,
        winner: 'GOOD' as const,
        mySeat: 3,
        myCharacterId: 'jacheongbi' as const,
        isWinner: true,
        players: [
          { seat: 1, characterId: 'jeoseung' as const, nickname: '악당', isWinner: false },
          { seat: 3, characterId: 'jacheongbi' as const, nickname: '달래', isWinner: true },
        ],
      },
    ]);
    renderMyPage(null, onFetchMatchHistory);

    expect(await screen.findByText(/3번 자청비/)).toBeTruthy();
    expect(screen.getByText('승리')).toBeTruthy(); // 요약 행의 배지

    fireEvent.click(screen.getByText(/3번 자청비/));
    expect(await screen.findByText(/1번 악당/)).toBeTruthy();
    expect(screen.getByText(/3번 달래/)).toBeTruthy();
  });
});
