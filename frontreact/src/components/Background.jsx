export default function Background({ theme }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '8%',
          right: '12%',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: `radial-gradient(circle at 40% 35%, ${theme.moonColor} 0%, ${theme.moonColor} 28%, transparent 72%)`,
          filter: 'blur(2px)',
          animation: 'wt-glow 6s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '12%',
          right: '16%',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: theme.moonColor,
          boxShadow: `0 0 60px 10px ${theme.moonGlowShadow}`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '120%',
          height: '38%',
          background: theme.mountainFar,
          clipPath:
            'polygon(0% 100%, 0% 55%, 10% 40%, 22% 58%, 34% 30%, 48% 52%, 60% 22%, 74% 48%, 88% 34%, 100% 50%, 100% 100%)',
          animation: 'wt-drift 22s ease-in-out infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '-5%',
          width: '130%',
          height: '30%',
          background: theme.mountainMid,
          clipPath:
            'polygon(0% 100%, 0% 65%, 14% 45%, 26% 62%, 40% 35%, 55% 60%, 68% 40%, 82% 58%, 100% 42%, 100% 100%)',
          animation: 'wt-drift 16s ease-in-out infinite reverse',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '110%',
          height: '20%',
          background: theme.mountainNear,
          clipPath:
            'polygon(0% 100%, 0% 70%, 18% 50%, 32% 68%, 50% 45%, 66% 66%, 82% 50%, 100% 68%, 100% 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 40%, transparent 40%, ${theme.vignetteColor} 100%)`,
          pointerEvents: 'none',
          left: 5,
          top: 4,
        }}
      />
    </>
  );
}
