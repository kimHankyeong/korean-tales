export default function MypageSettingsScreen({
  theme,
  settingsIdDisplay,
  signupEmail,
  signupNickname,
  onSettingsEmailChange,
  onSettingsNicknameChange,
  saveSettings,
  settingsSaved,
  settingsNewPw,
  onSettingsNewPwChange,
  saveNewPassword,
  settingsPwError,
  settingsPwSaved,
  goToMypage,
}) {
  return (
    <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 420, padding: '44px 32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <button onClick={goToMypage} className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 0 24px' }}>
        ← 뒤로
      </button>
      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 22, color: theme.textPrimary, margin: '0 0 26px', letterSpacing: 1 }}>
        회원설정
      </h2>

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>아이디</label>
      <p style={{ textAlign: 'left', margin: '0 0 22px', fontSize: 15, color: theme.textMuted, padding: '10px 2px', borderBottom: `1px solid ${theme.outlineBorder}` }}>
        {settingsIdDisplay}
      </p>

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>이메일</label>
      <input
        value={signupEmail}
        onChange={onSettingsEmailChange}
        placeholder="you@example.com"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 22 }}
      />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>닉네임</label>
      <input
        value={signupNickname}
        onChange={onSettingsNicknameChange}
        placeholder="게임 속에서 불릴 이름"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 16 }}
      />

      <button onClick={saveSettings} className="btn-primary" style={{ width: '100%', padding: '14px 0', borderRadius: 2, fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
        저장
      </button>
      {settingsSaved && <p style={{ textAlign: 'center', fontSize: 12.5, color: theme.accentColor, margin: '12px 0 0' }}>저장되었습니다.</p>}

      <div style={{ height: 1, background: theme.outlineBorder, margin: '32px 0' }} />

      <label style={{ textAlign: 'left', fontSize: 12.5, color: theme.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>비밀번호 변경</label>
      <input
        type="password"
        value={settingsNewPw}
        onChange={onSettingsNewPwChange}
        placeholder="새 비밀번호 (8자 이상)"
        className="field-input"
        style={{ width: '100%', fontSize: 16, padding: '10px 2px', marginBottom: 10 }}
      />
      {settingsPwError && <p style={{ textAlign: 'left', fontSize: 12.5, color: theme.errorColor, margin: '0 0 12px' }}>{settingsPwError}</p>}
      <button
        onClick={saveNewPassword}
        className="btn-outline"
        style={{ width: '100%', padding: '14px 0', borderRadius: 2, fontSize: 15, fontWeight: 600, letterSpacing: 1, marginTop: 6 }}
      >
        비밀번호 변경
      </button>
      {settingsPwSaved && <p style={{ textAlign: 'center', fontSize: 12.5, color: theme.accentColor, margin: '12px 0 0' }}>비밀번호가 변경되었습니다.</p>}
    </div>
  );
}
