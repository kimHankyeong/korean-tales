export default function ContactModal({
  theme,
  contactFormOpen,
  contactSent,
  contactMessage,
  onContactMessageChange,
  submitContactMessage,
  closeContactModal,
}) {
  return (
    <div
      onClick={closeContactModal}
      style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(6,7,9,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: theme.overlayBg, border: `1px solid ${theme.outlineBorder}`, borderRadius: 4, padding: 26, maxWidth: 380, width: '100%', boxSizing: 'border-box' }}
      >
        <p style={{ margin: '0 0 16px', fontFamily: "'Noto Serif KR', serif", fontSize: 16, color: theme.textPrimary }}>관리자에게 문의하기</p>

        {contactFormOpen ? (
          <>
            <textarea
              value={contactMessage}
              onChange={onContactMessageChange}
              placeholder="문의하실 내용을 적어주세요"
              className="field-textarea"
              style={{ width: '100%', minHeight: 110, fontSize: 13.5, padding: 12, borderRadius: 2, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={closeContactModal} className="btn-outline" style={{ flex: 1, padding: '12px 0', borderRadius: 2 }}>
                취소
              </button>
              <button onClick={submitContactMessage} className="btn-primary" style={{ flex: 1, padding: '12px 0', borderRadius: 2, fontWeight: 600 }}>
                보내기
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ textAlign: 'center', fontSize: 13.5, color: theme.accentColor, margin: '20px 0 22px', fontFamily: "'Noto Serif KR', serif" }}>
              문의가 접수되었습니다.
            </p>
            <button onClick={closeContactModal} className="btn-outline" style={{ width: '100%', padding: '12px 0', borderRadius: 2 }}>
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
