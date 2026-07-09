export default function SymbolPickerOverlay({ theme, charactersView, pickerTitle, closeSymbolPicker }) {
  return (
    <div
      onClick={closeSymbolPicker}
      style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(6,7,9,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: theme.overlayBg, border: `1px solid ${theme.outlineBorder}`, borderRadius: 4, padding: 26, maxWidth: 360, width: '100%' }}
      >
        <p style={{ margin: '0 0 16px', fontFamily: "'Noto Serif KR', serif", fontSize: 16, color: theme.textPrimary }}>{pickerTitle}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {charactersView.map((c) => (
            <div
              key={c.id}
              onClick={c.onSelect}
              className="hover-row"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '12px 6px',
                border: `1px solid ${theme.outlineBorder}`,
                borderRadius: 3,
              }}
            >
              <div style={c.swatchStyle} />
              <span style={{ fontSize: 11, color: theme.textSecondary }}>{c.name}</span>
            </div>
          ))}
        </div>
        <button
          onClick={closeSymbolPicker}
          className="btn-outline"
          style={{ width: '100%', marginTop: 18, padding: '12px 0', borderRadius: 2 }}
        >
          취소
        </button>
      </div>
    </div>
  );
}
