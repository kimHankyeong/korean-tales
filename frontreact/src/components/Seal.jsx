export default function Seal({ theme, appName, width, height, fontSize, marginBottom, rotate = -3, big = false }) {
  return (
    <div
      style={{
        width,
        height,
        background: theme.accentColor,
        border: big ? `2px solid ${theme.sealBorder}` : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `rotate(${rotate}deg)`,
        boxShadow: big ? '0 6px 24px rgba(0,0,0,0.35)' : '0 6px 20px rgba(0,0,0,0.3)',
        marginBottom,
      }}
    >
      <span
        style={{
          fontFamily: "'Noto Serif KR', serif",
          fontSize,
          fontWeight: 700,
          color: theme.sealText,
          letterSpacing: big ? 1 : undefined,
        }}
      >
        {appName}
      </span>
    </div>
  );
}
