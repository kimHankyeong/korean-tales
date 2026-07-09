import Seal from '../components/Seal';

export default function SelectScreen({ theme, appName, goToLogin, goToSignup }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: 420,
        padding: '56px 36px 44px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <Seal theme={theme} appName={appName} width={86} height={98} fontSize={22} marginBottom={22} big />

      <h1
        style={{
          fontFamily: "'Noto Serif KR', serif",
          fontWeight: 700,
          fontSize: 40,
          color: theme.textPrimary,
          margin: '0 0 10px',
          letterSpacing: 2,
        }}
      >
        {appName}
      </h1>

      <p style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 400, fontSize: 16, color: theme.textSecondary, margin: '0 0 4px', letterSpacing: 0.5 }}>
        달빛 아래, 진실을 가려라
      </p>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 48px', letterSpacing: 0.3 }}>
        채팅으로 즐기는 심리 추리 게임
      </p>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={goToLogin}
          className="btn-primary"
          style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
        >
          로그인
        </button>
        <button
          onClick={goToSignup}
          className="btn-outline"
          style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
        >
          회원가입
        </button>
      </div>

      <p style={{ fontSize: 11.5, color: theme.textFooter, margin: '36px 0 0', lineHeight: 1.6, letterSpacing: 0.2 }}>
        계속 진행하면 이용약관 및<br />
        개인정보처리방침에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  );
}
