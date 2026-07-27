import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAdminEmail } from './admin';

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe('isAdminEmail — ADMIN_EMAILS 환경변수 기반 관리자 판별 (13번)', () => {
  it('ADMIN_EMAILS에 등록된 이메일은 대소문자·공백 무관하게 관리자로 인식된다', () => {
    process.env.ADMIN_EMAILS = 'hankyeoungkim@gmail.com, other@example.com';
    expect(isAdminEmail('hankyeoungkim@gmail.com')).toBe(true);
    expect(isAdminEmail('HankyeoungKim@Gmail.com')).toBe(true); // 대소문자 무관
    expect(isAdminEmail('  hankyeoungkim@gmail.com  ')).toBe(true); // 앞뒤 공백 무관
    expect(isAdminEmail('other@example.com')).toBe(true);
  });

  it('ADMIN_EMAILS에 없는 이메일은 관리자가 아니다', () => {
    process.env.ADMIN_EMAILS = 'hankyeoungkim@gmail.com';
    expect(isAdminEmail('someone-else@example.com')).toBe(false);
  });

  it('ADMIN_EMAILS이 비어 있거나 미설정이면 아무도 관리자가 아니다', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('hankyeoungkim@gmail.com')).toBe(false);
    process.env.ADMIN_EMAILS = '';
    expect(isAdminEmail('hankyeoungkim@gmail.com')).toBe(false);
  });
});
