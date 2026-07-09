import { chipStyle } from '../utils/chipStyle';

export default function RoomSettingsScreen({
  theme,
  roomMode,
  roomVisibility,
  roomName,
  setRoomMode,
  setRoomVisibility,
  onRoomNameChange,
  submitRoomSettings,
  goToRooms,
}) {
  const roomNameEmpty = roomName.trim().length === 0;

  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 420, padding: '44px 32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToRooms} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 20px' }}>
        ← 뒤로
      </button>
      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 24, color: theme.textPrimary, margin: '0 0 28px', letterSpacing: 1 }}>
        방 만들기
      </h2>

      <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, margin: '0 0 10px', letterSpacing: 0.5 }}>인원</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setRoomMode(6)}
          style={{ flex: 1, padding: '12px 0', borderRadius: 2, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', ...chipStyle(theme, roomMode === 6) }}
        >
          6인 모드
        </button>
        <button
          onClick={() => setRoomMode(9)}
          style={{ flex: 1, padding: '12px 0', borderRadius: 2, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', ...chipStyle(theme, roomMode === 9) }}
        >
          9인 모드
        </button>
      </div>

      <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, margin: '0 0 10px', letterSpacing: 0.5 }}>공개 여부</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setRoomVisibility('public')}
          style={{ flex: 1, padding: '12px 0', borderRadius: 2, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', ...chipStyle(theme, roomVisibility === 'public') }}
        >
          공개
        </button>
        <button
          onClick={() => setRoomVisibility('private')}
          style={{ flex: 1, padding: '12px 0', borderRadius: 2, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', ...chipStyle(theme, roomVisibility === 'private') }}
        >
          비공개
        </button>
      </div>

      <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, margin: '0 0 10px', letterSpacing: 0.5 }}>방 이름</p>
      <input
        value={roomName}
        onChange={onRoomNameChange}
        placeholder="방 이름을 입력하세요"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 32 }}
      />

      <button
        onClick={submitRoomSettings}
        disabled={roomNameEmpty}
        className="btn-primary"
        style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1, opacity: roomNameEmpty ? 0.45 : 1 }}
      >
        방 만들기
      </button>
    </div>
  );
}
