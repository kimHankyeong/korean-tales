/** 게임 서버 주소 (REST + Socket.io) — client/.env의 VITE_SERVER_URL로 주입 */
export const SERVER_URL: string =
  (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:4000';
