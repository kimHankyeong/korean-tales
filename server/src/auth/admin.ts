/**
 * 관리자 판별 — ADMIN_EMAILS 환경변수(쉼표 구분 이메일 목록)에 계정 이메일이 있으면 관리자.
 * 별도 DB 스키마 변경 없이, 배포 환경변수만으로 기존 계정에 관리자 권한을 부여한다
 * (13번 — 관리자는 정원 미달이어도 게임을 시작해 혼자 테스트할 수 있다).
 */

function adminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isAdminEmail(email: string): boolean {
  return adminEmailSet().has(email.trim().toLowerCase());
}
