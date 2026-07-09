import Seal from '../components/Seal';

export default function SignupScreen({
  theme,
  appName,
  signupId,
  signupPw,
  signupEmail,
  signupNickname,
  signupError,
  signupSuccess,
  signupButtonLabel,
  onSignupIdChange,
  onSignupPwChange,
  onSignupEmailChange,
  onSignupNicknameChange,
  signupButtonAction,
  goToSelect,
  goToLogin,
}) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 400, padding: '44px 36px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToSelect} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 28px' }}>
        ← 뒤로
      </button>

      <Seal theme={theme} appName={appName} width={48} height={56} fontSize={13} marginBottom={16} />

      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 28, color: theme.textPrimary, margin: '0 0 8px', letterSpacing: 1 }}>
        회원가입
      </h2>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 30px' }}>그림자 속 새로운 이름을 등록하세요</p>

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>아이디</label>
      <input
        value={signupId}
        onChange={onSignupIdChange}
        placeholder="사용할 아이디"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 20 }}
      />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>비밀번호</label>
      <input
        type="password"
        value={signupPw}
        onChange={onSignupPwChange}
        placeholder="비밀번호 (8자 이상)"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 20 }}
      />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>이메일</label>
      <input
        type="email"
        value={signupEmail}
        onChange={onSignupEmailChange}
        placeholder="you@example.com"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 20 }}
      />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>닉네임</label>
      <input
        value={signupNickname}
        onChange={onSignupNicknameChange}
        placeholder="게임 속에서 불릴 이름"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 10 }}
      />

      {signupError && <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.errorColor, margin: '6px 0 0' }}>{signupError}</p>}

      <button
        onClick={signupButtonAction}
        className="btn-primary"
        style={{ width: '100%', marginTop: 26, padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
      >
        {signupButtonLabel}
      </button>

      {signupSuccess && (
        <p style={{ textAlign: 'center', fontSize: 13, color: theme.accentColor, margin: '18px 0 0', fontFamily: "'Noto Serif KR', serif" }}>
          등록이 완료되었습니다. 완료를 눌러 계속하세요.
        </p>
      )}

      <p style={{ textAlign: 'center', fontSize: 13, color: theme.textMuted, margin: '32px 0 0' }}>
        이미 계정이 있으신가요?
        <span
          onClick={goToLogin}
          className="link-span"
          style={{ color: theme.textPrimary, borderBottom: `1px solid ${theme.outlineBorder}` }}
        >
          {' '}
          로그인
        </span>
      </p>
    </div>
  );
}
