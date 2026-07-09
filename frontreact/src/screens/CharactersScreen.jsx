import { tabStyle } from '../utils/chipStyle';

export default function CharactersScreen({ theme, charactersView, selectedCharacterView, goToHome }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: 640,
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '44px 30px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <button onClick={goToHome} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 20px' }}>
        ← 게임 설명으로
      </button>
      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 24, color: theme.textPrimary, margin: '0 0 6px', letterSpacing: 1 }}>
        아홉 개의 문양
      </h2>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 20px' }}>이름을 눌러 각자의 역할과 능력을 확인하세요</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {charactersView.map((c) => (
          <button
            key={c.id}
            onClick={c.onSelectTab}
            style={{
              flexShrink: 0,
              padding: '9px 16px',
              borderRadius: 14,
              fontFamily: "'Noto Sans KR', sans-serif",
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              ...tabStyle(theme, c.active),
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 180,
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
            padding: 10,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.textMuted, letterSpacing: 0.5 }}>
            character illustration
            <br />
            3:5
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 220, textAlign: 'left' }}>
          <div style={{ ...selectedCharacterView.swatchStyleLarge, marginBottom: 14 }} />
          <h3 style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 22, color: theme.textPrimary, margin: '0 0 8px' }}>
            {selectedCharacterView.name}
          </h3>
          <span
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 10,
              color: selectedCharacterView.factionColor,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {selectedCharacterView.factionLabel}
          </span>
          <p style={{ margin: '16px 0 0', fontSize: 14, color: theme.textSecondary, lineHeight: 1.7 }}>{selectedCharacterView.ability}</p>
        </div>
      </div>
    </div>
  );
}
