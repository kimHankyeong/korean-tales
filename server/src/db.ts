/**
 * Prisma 클라이언트 싱글턴 — SQLite 파일 경로는 DATABASE_URL 환경변수로 분리한다.
 * (로컬: file:./dev.db, Render: file:/data/korean_tales.db — server/.env.example 참고)
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
