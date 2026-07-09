export function chipStyle(theme, active) {
  return active
    ? { background: theme.accentColor, color: '#f3ece1', border: `1px solid ${theme.accentColor}` }
    : { background: 'transparent', color: '#f4efe6', border: '1px solid rgba(244,239,230,0.35)' };
}

export function tabStyle(theme, active) {
  return active
    ? { color: '#f3ece1', background: theme.accentColor, border: `1px solid ${theme.accentColor}` }
    : { color: '#f4efe6', background: 'rgba(244,239,230,0.06)', border: '1px solid rgba(244,239,230,0.3)' };
}
