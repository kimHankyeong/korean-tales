/**
 * 마이페이지 — requirements 11번:
 * 현재 프로필 사진·닉네임 표시 및 변경, 프로필 사진 업로드(기기 파일 선택 → 크롭 → 전송).
 * 서버 호출은 콜백으로 주입받아 데모(목)와 실서버 연동 양쪽에서 동작한다.
 */

import { useEffect, useRef, useState } from 'react';
import { CHARACTER_BY_ID, FACTION_META, type CharacterId, type Faction, type PlayerMode } from '@korean-tales/shared';
import { AVATAR_ERROR_MESSAGES, validateAvatarFile } from '../lib/avatarUpload';
import { Avatar } from './Avatar';
import { AvatarCropModal } from './AvatarCropModal';

export interface MyPageUser {
  nickname: string;
  profileImageUrl: string | null;
}

/** 최근 전적(2번 항목) 1개 — 본인 결과 + 그 판 전원(로그인 유저만)의 좌석/직업/닉네임/승패 */
export interface MyPageMatchHistoryEntry {
  gameId: string;
  playedAt: string;
  mode: PlayerMode;
  winner: Faction;
  mySeat: number;
  myCharacterId: CharacterId;
  isWinner: boolean;
  players: Array<{ seat: number; characterId: CharacterId; nickname: string; isWinner: boolean }>;
}

export interface MyPageProps {
  user: MyPageUser;
  /** 닉네임 저장 — 실패 시 에러 메시지 반환, 성공 시 null */
  onChangeNickname: (nickname: string) => Promise<string | null>;
  /** 크롭·리사이즈된 Blob 업로드 — 실패 시 에러 메시지 반환 */
  onUploadAvatar: (blob: Blob) => Promise<string | null>;
  /** 배경음악 음량 (0~1) */
  bgmVolume: number;
  onChangeBgmVolume: (volume: number) => void;
  /** 비밀번호 변경 — 실패 시 에러 메시지 반환, 성공 시 null. 미지정 시 비밀번호 변경 UI 숨김 */
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<string | null>;
  /** 최근 전적 조회 — 미지정 시 전적 섹션 숨김 */
  onFetchMatchHistory?: () => Promise<MyPageMatchHistoryEntry[]>;
  onClose: () => void;
}

export function MyPage({
  user,
  onChangeNickname,
  onUploadAvatar,
  bgmVolume,
  onChangeBgmVolume,
  onChangePassword,
  onFetchMatchHistory,
  onClose,
}: MyPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(user.nickname);
  const [message, setMessage] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [matches, setMatches] = useState<MyPageMatchHistoryEntry[] | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!onFetchMatchHistory) return;
    void onFetchMatchHistory().then(setMatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    // 클라이언트측 형식·용량 검증 (서버에서도 재검증)
    const error = validateAvatarFile(file);
    if (error) {
      setMessage(AVATAR_ERROR_MESSAGES[error]);
      return;
    }
    setMessage(null);
    setCropFile(file);
  }

  async function saveNickname() {
    setBusy(true);
    const error = await onChangeNickname(nickname.trim());
    setBusy(false);
    setMessage(error ?? '닉네임을 변경했어요.');
  }

  async function confirmCrop(blob: Blob) {
    setCropFile(null);
    setBusy(true);
    const error = await onUploadAvatar(blob);
    setBusy(false);
    setMessage(error ?? '프로필 사진을 변경했어요.');
  }

  async function savePassword() {
    if (!onChangePassword) return;
    setPasswordBusy(true);
    const error = await onChangePassword(currentPassword, newPassword);
    setPasswordBusy(false);
    setPasswordMessage(error ?? '비밀번호를 변경했어요.');
    if (!error) {
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/60 p-4" role="dialog" aria-label="마이페이지">
      <section className="flex max-h-[85vh] w-full max-w-sm flex-col items-center gap-4 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-6">
        <h1 className="text-base font-bold text-amber-300">마이페이지</h1>

        {/* 현재 프로필 사진 — 미설정 시 기본 아바타 */}
        <Avatar name={user.nickname} url={user.profileImageUrl} size={96} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-slate-500 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          사진 변경
        </button>
        {/* 기기 파일 접근 — 모바일에서는 갤러리/카메라 (11번: accept="image/*") */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="프로필 사진 선택"
          onChange={(e) => {
            onFileSelected(e.target.files?.[0]);
            e.target.value = ''; // 같은 파일 재선택 허용
          }}
        />

        {/* 닉네임 변경 */}
        <div className="flex w-full gap-2">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
            aria-label="닉네임"
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
          />
          <button
            type="button"
            disabled={busy || nickname.trim().length === 0 || nickname.trim() === user.nickname}
            onClick={() => void saveNickname()}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            저장
          </button>
        </div>

        {/* 배경음악 음량 — 시칠리안느 BGM, 즉시 반영·저장 */}
        <label className="flex w-full items-center gap-2 text-xs text-slate-300">
          <span className="shrink-0">배경음악</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(bgmVolume * 100)}
            onChange={(e) => onChangeBgmVolume(Number(e.target.value) / 100)}
            aria-label="배경음악 음량"
            className="min-w-0 flex-1"
          />
          <span className="w-9 shrink-0 text-right tabular-nums">
            {Math.round(bgmVolume * 100)}%
          </span>
        </label>

        {message && (
          <p role="status" className="text-center text-xs text-amber-200">
            {message}
          </p>
        )}

        {onChangePassword && (
          <div className="w-full space-y-1.5 border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-400">비밀번호 변경</p>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              aria-label="현재 비밀번호"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (8자 이상)"
              aria-label="새 비밀번호"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={passwordBusy || !currentPassword || newPassword.length < 8}
              onClick={() => void savePassword()}
              className="w-full rounded-lg bg-amber-600 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              비밀번호 변경
            </button>
            {passwordMessage && (
              <p role="status" className="text-center text-xs text-amber-200">
                {passwordMessage}
              </p>
            )}
          </div>
        )}

        {onFetchMatchHistory && (
          <div className="w-full space-y-1.5 border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-400">최근 전적</p>
            {matches === null && <p className="text-center text-xs text-slate-500">불러오는 중…</p>}
            {matches !== null && matches.length === 0 && (
              <p className="text-center text-xs text-slate-500">아직 완료한 게임이 없어요.</p>
            )}
            {matches?.map((match) => {
              const expanded = expandedGameId === match.gameId;
              const myCharacter = CHARACTER_BY_ID[match.myCharacterId];
              return (
                <div key={match.gameId} className="overflow-hidden rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setExpandedGameId(expanded ? null : match.gameId)}
                    className="flex w-full items-center justify-between gap-2 bg-slate-800/60 px-3 py-2 text-left text-xs hover:bg-slate-800"
                  >
                    <span className="text-slate-300">
                      {new Date(match.playedAt).toLocaleDateString('ko-KR')} · {match.mode}인 ·{' '}
                      {match.mySeat}번 {myCharacter.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        match.isWinner ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {match.isWinner ? '승리' : '패배'}
                    </span>
                  </button>
                  {expanded && (
                    <ul className="space-y-1 px-3 py-2">
                      {match.players.map((p) => {
                        const character = CHARACTER_BY_ID[p.characterId];
                        return (
                          <li
                            key={p.seat}
                            className="flex items-center justify-between text-[11px] text-slate-300"
                          >
                            <span>
                              {p.seat}번 {p.nickname} — {character.name}
                              <span className="ml-1 text-slate-500">
                                ({FACTION_META[character.faction].label})
                              </span>
                            </span>
                            <span className={p.isWinner ? 'text-yellow-300' : 'text-slate-500'}>
                              {p.isWinner ? '승리' : '패배'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 underline hover:text-slate-200"
        >
          닫기
        </button>
      </section>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(blob) => void confirmCrop(blob)}
        />
      )}
    </div>
  );
}
