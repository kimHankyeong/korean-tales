export default function RoomsScreen({ theme, roomList, goToHome, goToRoomSettings }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 440, padding: '44px 32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToHome} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 20px' }}>
        ← 뒤로
      </button>
      <h2
        style={{
          fontFamily: "'Noto Serif KR', serif",
          fontWeight: 700,
          fontSize: 24,
          color: theme.textPrimary,
          margin: '0 0 24px',
          letterSpacing: 1,
          textAlign: 'center',
        }}
      >
        방 선택
      </h2>

      <button
        onClick={goToRoomSettings}
        className="btn-primary"
        style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 15, fontWeight: 600, letterSpacing: 1, marginBottom: 28 }}
      >
        방 만들기
      </button>

      <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '0 0 12px', letterSpacing: 0.3 }}>공개된 방</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {roomList.map((r) => (
          <div
            key={r.key}
            onClick={r.onJoin}
            className="hover-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(244,239,230,0.04)',
              border: `1px solid ${theme.outlineBorder}`,
              borderRadius: 2,
              padding: '14px 16px',
              textAlign: 'left',
            }}
          >
            <div>
              <p style={{ margin: '0 0 4px', fontFamily: "'Noto Serif KR', serif", fontSize: 14.5, color: theme.textPrimary }}>{r.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>
                {r.mode}인 모드 · {r.visibility} · {r.players}/{r.mode}명
              </p>
            </div>
            <span style={{ color: theme.textSecondary, fontSize: 16 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
