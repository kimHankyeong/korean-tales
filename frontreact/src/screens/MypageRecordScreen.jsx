export default function MypageRecordScreen({ theme, winCount, totalCount, matchHistoryView, goToMypage }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: 460,
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '44px 32px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <button onClick={goToMypage} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 20px' }}>
        ← 뒤로
      </button>
      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 22, color: theme.textPrimary, margin: '0 0 20px', letterSpacing: 1 }}>
        전적
      </h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', background: 'rgba(244,239,230,0.04)', border: `1px solid ${theme.outlineBorder}`, borderRadius: 3 }}>
          <p style={{ margin: '0 0 4px', fontFamily: "'Noto Serif KR', serif", fontSize: 26, color: theme.accentColor }}>{winCount}</p>
          <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>이긴 횟수</p>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '18px 0', background: 'rgba(244,239,230,0.04)', border: `1px solid ${theme.outlineBorder}`, borderRadius: 3 }}>
          <p style={{ margin: '0 0 4px', fontFamily: "'Noto Serif KR', serif", fontSize: 26, color: theme.textPrimary }}>{totalCount}</p>
          <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>총 플레이 횟수</p>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '0 0 12px', letterSpacing: 0.3 }}>최근 3판</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matchHistoryView.map((m) => (
          <div key={m.key} style={{ background: 'rgba(244,239,230,0.04)', border: `1px solid ${theme.outlineBorder}`, borderRadius: 2, overflow: 'hidden' }}>
            <div
              onClick={m.onToggle}
              className="hover-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, color: m.resultBadgeColor, background: m.resultBadgeBg }}>{m.result}</span>
                <span style={{ fontSize: 13, color: theme.textSecondary }}>
                  {m.when} · {m.mode}인 모드
                </span>
              </div>
              <span style={{ color: theme.textMuted, fontSize: 13 }}>{m.toggleLabel}</span>
            </div>
            {m.expanded && (
              <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {m.players.map((p) => (
                  <div key={p.num} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                    <span style={{ color: theme.textPrimary }}>
                      {p.num}번 · {p.character.name}
                    </span>
                    <span
                      style={{
                        color: p.factionColor,
                        background: p.factionBg,
                        border: `1px solid ${p.factionBorder}`,
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 10.5,
                      }}
                    >
                      {p.factionLabel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
