export default function MypageScreen({ theme, nickname, email, goToHome, goToMypageRecord, goToMypageSettings, openContactModal }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 420, padding: '44px 32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToHome} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 24px' }}>
        ← 뒤로
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 30 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: theme.accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 18, color: theme.sealText }}>{nickname}</span>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: '0 0 4px', fontFamily: "'Noto Serif KR', serif", fontSize: 17, color: theme.textPrimary }}>{nickname}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: theme.textMuted }}>{email}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={goToMypageRecord}
          className="hover-row"
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '16px 18px',
            background: 'rgba(244,239,230,0.04)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 2,
            color: theme.textPrimary,
            fontSize: 14.5,
            fontFamily: "'Noto Sans KR', sans-serif",
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          전적 보기 <span>→</span>
        </button>
        <button
          onClick={goToMypageSettings}
          className="hover-row"
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '16px 18px',
            background: 'rgba(244,239,230,0.04)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 2,
            color: theme.textPrimary,
            fontSize: 14.5,
            fontFamily: "'Noto Sans KR', sans-serif",
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          회원설정 <span>→</span>
        </button>
        <button
          onClick={openContactModal}
          className="hover-row"
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '16px 18px',
            background: 'rgba(244,239,230,0.04)',
            border: `1px solid ${theme.outlineBorder}`,
            borderRadius: 2,
            color: theme.textPrimary,
            fontSize: 14.5,
            fontFamily: "'Noto Sans KR', sans-serif",
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          관리자에게 문의하기 <span>→</span>
        </button>
      </div>
    </div>
  );
}
