import Seal from '../components/Seal';

export default function HomeScreen({ theme, appName, goToSelect, goToMypage, goToCharacters, goToRooms }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: 440,
        padding: '48px 36px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={goToSelect} className="btn-ghost" style={{ fontSize: 14, padding: 0 }}>
          ← 뒤로
        </button>
        <button
          onClick={goToMypage}
          className="btn-outline"
          style={{ fontSize: 12.5, padding: '7px 14px', borderRadius: 2 }}
        >
          마이페이지
        </button>
      </div>

      <Seal theme={theme} appName={appName} width={56} height={64} fontSize={14} marginBottom={20} />

      <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 700, fontSize: 26, color: theme.textPrimary, margin: '0 0 24px', letterSpacing: 1 }}>
        게임 방법
      </h2>

      <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        <div style={{ background: 'rgba(244,239,230,0.04)', border: `1px solid ${theme.outlineBorder}`, borderRadius: 2, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 6px', fontFamily: "'Noto Serif KR', serif", fontSize: 14, color: theme.textPrimary }}>낮 — 토론과 투표</p>
          <p style={{ margin: 0, fontSize: 13, color: theme.textSecondary, lineHeight: 1.6 }}>
            채팅으로 정체를 추리하고, 의심스러운 이를 투표로 지목해 몰아냅니다.
          </p>
        </div>
        <div style={{ background: 'rgba(244,239,230,0.04)', border: `1px solid ${theme.outlineBorder}`, borderRadius: 2, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 6px', fontFamily: "'Noto Serif KR', serif", fontSize: 14, color: theme.textPrimary }}>밤 — 각자의 능력</p>
          <p style={{ margin: 0, fontSize: 13, color: theme.textSecondary, lineHeight: 1.6 }}>
            저마다의 문양을 지닌 존재들이 은밀히 움직입니다. 악의 무리는 하나씩 지워나가고, 선한 이들은 진실을 좇습니다.
          </p>
        </div>
      </div>

      <button
        onClick={goToCharacters}
        className="btn-outline"
        style={{ width: '100%', padding: '14px 0', borderRadius: 2, fontSize: 15, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}
      >
        9개의 문양 살펴보기
      </button>
      <button
        onClick={goToRooms}
        className="btn-primary"
        style={{ width: '100%', padding: '16px 0', borderRadius: 2, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}
      >
        게임 시작
      </button>
    </div>
  );
}
