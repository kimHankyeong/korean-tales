export default function LobbyScreen({ theme, pendingRoom, lobbyPlayers, startGameFromLobby, goToRooms }) {
  if (!pendingRoom) return null;
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 440, padding: '44px 32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToRooms} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 20px' }}>
        ← 뒤로
      </button>

      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 22, color: theme.textPrimary, margin: '0 0 6px', letterSpacing: 1 }}>
        {pendingRoom.name}
      </h2>
      <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '0 0 26px' }}>
        {pendingRoom.mode}인 모드 · {pendingRoom.visibility} · {pendingRoom.joinedCount}/{pendingRoom.mode}명 입장
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
        {lobbyPlayers.map((p) => (
          <div
            key={p.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 4px',
              border: `1px solid ${theme.outlineBorder}`,
              borderRadius: 3,
              opacity: p.opacityVal,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(244,239,230,0.08)',
                border: `1px solid ${theme.outlineBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 13, color: theme.textPrimary }}>{p.num}</span>
            </div>
            <span style={{ fontSize: 10.5, color: theme.textMuted }}>{p.statusLabel}</span>
          </div>
        ))}
      </div>

      <button
        onClick={startGameFromLobby}
        className="btn-primary"
        style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
      >
        게임 시작
      </button>
    </div>
  );
}
