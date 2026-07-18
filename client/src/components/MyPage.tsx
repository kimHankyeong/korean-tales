/**
 * 마이페이지 — requirements 11번:
 * 현재 프로필 사진·닉네임 표시 및 변경, 프로필 사진 업로드(기기 파일 선택 → 크롭 → 전송).
 * 서버 호출은 콜백으로 주입받아 데모(목)와 실서버 연동 양쪽에서 동작한다.
 */

import { useRef, useState } from 'react';
import { AVATAR_ERROR_MESSAGES, validateAvatarFile } from '../lib/avatarUpload';
import { Avatar } from './Avatar';
import { AvatarCropModal } from './AvatarCropModal';

export interface MyPageUser {
  nickname: string;
  profileImageUrl: string | null;
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
  onClose: () => void;
}

export function MyPage({
  user,
  onChangeNickname,
  onUploadAvatar,
  bgmVolume,
  onChangeBgmVolume,
  onChangePassword,
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
      <section className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-slate-600 bg-slate-900 p-6">
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
