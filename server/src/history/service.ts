/**
 * 전적 서비스 — requirements 2번 항목(마이페이지 최근 3판 전적).
 * 게임 종료 시 로그인 유저 참가자만 기록한다(게스트는 계정이 없어 대상 아님).
 */

import type { PrismaClient } from '@prisma/client';
import type { CharacterId, Faction, PlayerMode } from '@korean-tales/shared';

export interface GameHistoryParticipant {
  accountId: string;
  seat: number;
  characterId: CharacterId;
  faction: Faction;
  isWinner: boolean;
}

/** Room이 게임 종료 시 전달하는 기록 요청 — 로그인 유저가 한 명도 없으면 기록하지 않는다 */
export interface GameHistoryRecord {
  mode: PlayerMode;
  winner: Faction;
  participants: readonly GameHistoryParticipant[];
}

/** 마이페이지에 보여줄 판 1개 — 본인 결과 + 그 판 전원의 좌석/직업/닉네임/승패 */
export interface MatchHistoryEntry {
  gameId: string;
  playedAt: Date;
  mode: PlayerMode;
  winner: Faction;
  mySeat: number;
  myCharacterId: CharacterId;
  isWinner: boolean;
  players: Array<{
    seat: number;
    characterId: CharacterId;
    nickname: string;
    isWinner: boolean;
  }>;
}

export class HistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /** 게임 종료 직후 호출 — 로그인 유저 참가자가 없으면 아무것도 쓰지 않는다 */
  async recordGame(record: GameHistoryRecord): Promise<void> {
    if (record.participants.length === 0) return;
    await this.prisma.game.create({
      data: {
        mode: record.mode,
        winner: record.winner,
        participants: {
          create: record.participants.map((p) => ({
            userId: p.accountId,
            seat: p.seat,
            characterId: p.characterId,
            faction: p.faction,
            isWinner: p.isWinner,
          })),
        },
      },
    });
  }

  /** 마이페이지 최근 전적 — 최신 판부터 최대 limit개 */
  async getRecentMatches(userId: string, limit = 3): Promise<MatchHistoryEntry[]> {
    const participations = await this.prisma.gameParticipant.findMany({
      where: { userId },
      orderBy: { game: { playedAt: 'desc' } },
      take: limit,
      include: {
        game: {
          include: {
            participants: { include: { user: { select: { nickname: true } } } },
          },
        },
      },
    });

    return participations.map((p) => ({
      gameId: p.gameId,
      playedAt: p.game.playedAt,
      mode: p.game.mode as PlayerMode,
      winner: p.game.winner as Faction,
      mySeat: p.seat,
      myCharacterId: p.characterId as CharacterId,
      isWinner: p.isWinner,
      players: p.game.participants
        .map((gp) => ({
          seat: gp.seat,
          characterId: gp.characterId as CharacterId,
          nickname: gp.user.nickname,
          isWinner: gp.isWinner,
        }))
        .sort((a, b) => a.seat - b.seat),
    }));
  }
}
