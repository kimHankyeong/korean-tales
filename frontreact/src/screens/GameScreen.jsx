export default function GameScreen({
  theme,
  dayNightDotColor,
  dayNightLabel,
  toggleDayNight,
  viewToggleLabel,
  toggleViewMode,
  openCharPanel,
  goToGameOver,
  chatMessagesView,
  chatInput,
  onChatInputChange,
  sendChatMessage,
  isAllView,
  playersView,
  factionGroups,
}) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1000, padding: 28, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div
          onClick={toggleDayNight}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            background: 'rgba(244,239,230,0.05)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 20,
            padding: '8px 18px',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dayNightDotColor }} />
          <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 14, color: theme.textPrimary, letterSpacing: 1 }}>{dayNightLabel}</span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={toggleViewMode} className="btn-outline" style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 2 }}>
            {viewToggleLabel}
          </button>
          <button onClick={openCharPanel} className="btn-outline" style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 2 }}>
            문양 설명
          </button>
          <button
            onClick={goToGameOver}
            className="btn-outline hover-fade"
            style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 2, color: theme.textMuted }}
          >
            게임 종료
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* chat panel */}
        <div
          style={{
            flex: 2,
            minWidth: 300,
            background: 'rgba(14,18,42,0.55)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 4,
            display: 'flex',
            flexDirection: 'column',
            height: 520,
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatMessagesView.map((m) => (
              <div key={m.key} style={{ alignSelf: m.alignSelf, maxWidth: '78%' }}>
                {m.system ? (
                  <p style={{ textAlign: 'center', fontSize: 12, color: theme.textMuted, fontStyle: 'italic', margin: 0 }}>{m.text}</p>
                ) : (
                  <div>
                    <p style={{ margin: '0 0 3px', fontSize: 11, color: theme.textMuted }}>{m.sender}</p>
                    <div style={{ background: m.bubbleBg, color: m.bubbleColor, padding: '9px 13px', borderRadius: 3, fontSize: 14, lineHeight: 1.4 }}>
                      {m.text}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: `1px solid ${theme.outlineBorder}` }}>
            <input
              value={chatInput}
              onChange={onChatInputChange}
              placeholder="메시지를 입력하세요"
              className="field-input"
              style={{ flex: 1, fontSize: 14, padding: '8px 2px' }}
            />
            <button onClick={sendChatMessage} className="btn-primary" style={{ padding: '0 20px', borderRadius: 2, fontSize: 13, fontWeight: 600 }}>
              전송
            </button>
          </div>
        </div>

        {/* players panel */}
        <div
          style={{
            flex: 1,
            minWidth: 240,
            background: 'rgba(14,18,42,0.55)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 4,
            padding: 18,
            height: 520,
            overflowY: 'auto',
            boxSizing: 'border-box',
          }}
        >
          {isAllView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {playersView.map((p) => (
                <div
                  key={p.num}
                  onClick={p.onRowClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 3, cursor: 'pointer', ...p.rowStyleObj }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(244,239,230,0.08)',
                      border: `1px solid ${theme.outlineBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 14, color: theme.textPrimary }}>{p.num}</span>
                    {p.symbolStyle && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: -4,
                          right: -4,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: '#141a34',
                          border: `1px solid ${theme.outlineBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div style={{ ...p.symbolStyle, width: 9, height: 9 }} />
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13.5, color: theme.textPrimary }}>{p.displayLabel}</p>
                    <p style={{ margin: 0, fontSize: 11, color: theme.textMuted }}>{p.subtitleText}</p>
                  </div>
                  {p.isOther && (
                    <span
                      onClick={p.onToggleReveal}
                      className="hover-fade"
                      style={{
                        fontSize: 10.5,
                        color: theme.textMuted,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        borderBottom: `1px dotted ${theme.outlineBorder}`,
                      }}
                    >
                      {p.revealToggleLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {factionGroups.map((g) => (
                <div key={g.key}>
                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: 11.5,
                      letterSpacing: 1,
                      color: g.color,
                      background: g.bg,
                      border: `1px solid ${g.border}`,
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 10,
                    }}
                  >
                    {g.label}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.members.map((p) => (
                      <div
                        key={p.num}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: 'rgba(244,239,230,0.03)', borderRadius: 3 }}
                      >
                        <div style={p.symbolStyle} />
                        <span style={{ fontSize: 13, color: theme.textPrimary }}>
                          {p.num}번 · {p.claimedName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
