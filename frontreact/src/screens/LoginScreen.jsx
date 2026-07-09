import Seal from '../components/Seal';

export default function LoginScreen({
  theme,
  appName,
  loginId,
  loginPw,
  loginError,
  loginSuccess,
  loginButtonLabel,
  onLoginIdChange,
  onLoginPwChange,
  loginButtonAction,
  goToSelect,
  goToSignup,
}) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 400, padding: '44px 36px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button
        onClick={goToSelect}
        className="btn-ghost"
        style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 32px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ← 뒤로
      </button>

      <Seal theme={theme} appName={appName} width={48} height={56} fontSize={13} marginBottom={18} />

      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 28, color: theme.textPrimary, margin: '0 0 8px', letterSpacing: 1 }}>
        로그인
      </h2>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 36px' }}>다시 그림자 속으로 들어오세요</p>

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>아이디</label>
      <input
        value={loginId}
        onChange={onLoginIdChange}
        placeholder="아이디 입력"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 24 }}
      />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>비밀번호</label>
      <input
        type="password"
        value={loginPw}
        onChange={onLoginPwChange}
        placeholder="비밀번호 입력"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 10 }}
      />

      {loginError && <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.errorColor, margin: '6px 0 0' }}>{loginError}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 28px' }}>
        <span className="muted-link" style={{ fontSize: 12.5, color: theme.textMuted, cursor: 'pointer' }}>
          비밀번호를 잊으셨나요?
        </span>
      </div>

      <button
        onClick={loginButtonAction}
        className="btn-primary"
        style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
      >
        {loginButtonLabel}
      </button>

      {loginSuccess && (
        <p style={{ textAlign: 'center', fontSize: 13, color: theme.accentColor, margin: '18px 0 0', fontFamily: "'Noto Serif KR', serif" }}>
          환영합니다, 그림자의 벗이여. 완료를 눌러 계속하세요.
        </p>
      )}

      <p style={{ textAlign: 'center', fontSize: 13, color: theme.textMuted, margin: '32px 0 0' }}>
        아직 계정이 없으신가요?
        <span
          onClick={goToSignup}
          className="link-span"
          style={{ color: theme.textPrimary, borderBottom: `1px solid ${theme.outlineBorder}` }}
        >
          {' '}
          회원가입
        </span>
      </p>
    </div>
  );
}
