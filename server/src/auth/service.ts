/**
 * 계정 서비스 — requirements 11번 섹션.
 * 이메일+비밀번호 회원가입/로그인, argon2 해시, 불투명 토큰 세션(DB 저장).
 * HTTP(REST)와 Socket.io 핸드셰이크가 같은 세션 검증(validateSession)을 공유한다.
 */

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';

/** 클라이언트에 노출해도 되는 유저 정보 (비밀번호 해시 제외) */
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  createdAt: Date;
}

export type SignupError =
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD' // 8자 미만
  | 'INVALID_NICKNAME' // 2~12자 벗어남
  | 'EMAIL_TAKEN'
  | 'NICKNAME_TAKEN';

export type SignupResult =
  | { ok: true; user: AuthUser; token: string } // 가입 즉시 로그인
  | { ok: false; error: SignupError };

export type LoginResult =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; error: 'INVALID_CREDENTIALS' };

/** 세션 유효기간 — 30일 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;

function toAuthUser(user: {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  createdAt: Date;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    /** 테스트용 시계 주입 (세션 만료 판정) */
    private readonly now: () => number = Date.now,
  ) {}

  async signup(input: {
    email: string;
    password: string;
    nickname: string;
  }): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    const nickname = input.nickname.trim();

    if (!EMAIL_PATTERN.test(email)) return { ok: false, error: 'INVALID_EMAIL' };
    if (input.password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: 'WEAK_PASSWORD' };
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
      return { ok: false, error: 'INVALID_NICKNAME' };
    }

    if (await this.prisma.user.findUnique({ where: { email } })) {
      return { ok: false, error: 'EMAIL_TAKEN' };
    }
    if (await this.prisma.user.findUnique({ where: { nickname } })) {
      return { ok: false, error: 'NICKNAME_TAKEN' };
    }

    const passwordHash = await argon2.hash(input.password); // argon2id 기본
    const user = await this.prisma.user.create({
      data: { email, passwordHash, nickname },
    });

    const token = await this.createSession(user.id);
    return { ok: true, user: toAuthUser(user), token };
  }

  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // 유저 존재 여부를 응답으로 구분할 수 없게 동일한 에러를 반환
    if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' };
    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) return { ok: false, error: 'INVALID_CREDENTIALS' };

    const token = await this.createSession(user.id);
    return { ok: true, user: toAuthUser(user), token };
  }

  /** 세션 무효화 — 존재하지 않는 토큰이어도 조용히 성공 */
  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { token } });
  }

  /** REST(/auth/me)와 Socket.io 핸드셰이크가 공유하는 세션 검증 */
  async validateSession(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= this.now()) {
      await this.prisma.session.deleteMany({ where: { token } });
      return null;
    }
    return toAuthUser(session.user);
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { token, userId, expiresAt: new Date(this.now() + SESSION_TTL_MS) },
    });
    return token;
  }
}
