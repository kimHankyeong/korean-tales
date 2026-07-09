export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function darkenHex(hex, amt) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.round(((num >> 16) & 255) * (1 - amt));
  const g = Math.round(((num >> 8) & 255) * (1 - amt));
  const b = Math.round((num & 255) * (1 - amt));
  return `rgb(${r}, ${g}, ${b})`;
}
