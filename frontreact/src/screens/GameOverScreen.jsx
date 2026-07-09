export default function GameOverScreen({ theme, winnerLabel, gameOverGroups, setWinnerEvil, setWinnerGood, goToHome }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: 720,
        padding: '48px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '0 0 8px', letterSpacing: 1 }}>게임 종료</p>
      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 30, color: theme.accentColor, margin: '0 0 8px', letterSpacing: 1 }}>
        {winnerLabel} 진영의 승리
      </h2>
      <p style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 30px' }}>(데모용 전환 — 아래 버튼으로 결과를 바꿔볼 수 있어요)</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 36 }}>
        <button onClick={setWinnerEvil} className="btn-outline" style={{ padding: '9px 16px', borderRadius: 2, color: theme.textSecondary, fontSize: 12.5 }}>
          악 진영 승리 보기
        </button>
        <button onClick={setWinnerGood} className="btn-outline" style={{ padding: '9px 16px', borderRadius: 2, color: theme.textSecondary, fontSize: 12.5 }}>
          선 진영 승리 보기
        </button>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        {gameOverGroups.map((g) => (
          <div
            key={g.key}
            style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 280, transition: 'transform 0.4s ease, opacity 0.4s ease', ...g.cardStyle }}
          >
            {g.isWinner && (
              <div
                style={{
                  position: 'absolute',
                  inset: -30,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${theme.accentShadow} 0%, transparent 70%)`,
                  animation: 'wt-spotlight-pulse 2.6s ease-in-out infinite',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            )}
            <div style={{ position: 'relative', zIndex: 1, background: 'rgba(14,18,42,0.6)', border: `1px solid ${g.border}`, borderRadius: 4, padding: 20 }}>
              <p
                style={{
                  margin: '0 0 14px',
                  fontSize: 12,
                  letterSpacing: 1.5,
                  color: g.color,
                  background: g.bg,
                  border: `1px solid ${g.border}`,
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: 10,
                }}
              >
                {g.label} 진영
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.members.map((p) => (
                  <div key={p.num} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
                    <div style={p.symbolStyle} />
                    <span style={{ fontSize: 13.5, color: theme.textPrimary }}>
                      {p.num}번 · {p.character.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={goToHome}
        className="btn-primary"
        style={{ marginTop: 40, padding: '14px 28px', borderRadius: 2, fontSize: 15, fontWeight: 600, letterSpacing: 1 }}
      >
        홈으로
      </button>
    </div>
  );
}
