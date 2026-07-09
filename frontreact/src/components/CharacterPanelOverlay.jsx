import { tabStyle } from '../utils/chipStyle';

export default function CharacterPanelOverlay({ theme, charactersView, selectedCharacterView, closeCharPanel }) {
  return (
    <div
      onClick={closeCharPanel}
      style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(6,7,9,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: theme.overlayBg, border: `1px solid ${theme.outlineBorder}`, borderRadius: 4, padding: 24, maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <p style={{ margin: '0 0 14px', fontFamily: "'Noto Serif KR', serif", fontSize: 16, color: theme.textPrimary }}>아홉 개의 문양</p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {charactersView.map((c) => (
            <button
              key={c.id}
              onClick={c.onSelectTab}
              style={{
                flexShrink: 0,
                padding: '7px 13px',
                borderRadius: 12,
                fontFamily: "'Noto Sans KR', sans-serif",
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                ...tabStyle(theme, c.active),
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 120,
              aspectRatio: '3/5',
              flexShrink: 0,
              border: `1px solid ${theme.outlineBorder}`,
              borderRadius: 4,
              background:
                'repeating-linear-gradient(135deg, rgba(244,239,230,0.05) 0px, rgba(244,239,230,0.05) 10px, rgba(244,239,230,0.02) 10px, rgba(244,239,230,0.02) 20px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 8,
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: theme.textMuted }}>
              illustration
              <br />
              3:5
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 180, textAlign: 'left' }}>
            <div style={{ ...selectedCharacterView.swatchStyleLarge, marginBottom: 10 }} />
            <h3 style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 18, color: theme.textPrimary, margin: '0 0 6px' }}>{selectedCharacterView.name}</h3>
            <span
              style={{
                fontSize: 10.5,
                padding: '2px 9px',
                borderRadius: 10,
                color: selectedCharacterView.factionColor,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {selectedCharacterView.factionLabel}
            </span>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: theme.textSecondary, lineHeight: 1.6 }}>{selectedCharacterView.ability}</p>
          </div>
        </div>

        <button
          onClick={closeCharPanel}
          className="btn-outline"
          style={{ width: '100%', marginTop: 20, padding: '12px 0', borderRadius: 2 }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
