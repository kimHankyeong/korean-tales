/**
 * RoomManager — 방 코드 발급·조회·정리, 플레이어의 소속 방 추적.
 */

import type { RoomSummary } from '@korean-tales/shared';
import { Room, type JoiningPlayer, type RoomEmitter } from './room';

/** 혼동되기 쉬운 문자(0/O, 1/I)를 뺀 방 코드 문자셋 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** playerId → roomCode */
  private readonly memberships = new Map<string, string>();

  constructor(
    private readonly createEmitter: (roomCode: string) => RoomEmitter,
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[Math.min(CODE_CHARS.length - 1, Math.floor(this.rng() * CODE_CHARS.length))];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  create(host: JoiningPlayer): Room {
    this.leave(host.id); // 기존 방에서 제거
    const code = this.generateCode();
    const room = new Room(code, host, this.createEmitter(code), this.rng, this.now);
    this.rooms.set(code, room);
    this.memberships.set(host.id, code);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.memberships.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  join(code: string, player: JoiningPlayer): Room | 'NOT_FOUND' | 'ROOM_FULL' | 'ALREADY_IN_GAME' {
    const room = this.get(code);
    if (!room) return 'NOT_FOUND';
    this.leave(player.id);
    const error = room.join(player);
    if (error === 'ROOM_FULL' || error === 'ALREADY_IN_GAME') return error;
    this.memberships.set(player.id, room.code);
    return room;
  }

  /** 방 나가기 — 방이 비면 폐기. 연결 종료(disconnect) 시에도 호출 */
  leave(playerId: string): void {
    const room = this.roomOf(playerId);
    this.memberships.delete(playerId);
    if (!room) return;
    const empty = room.leave(playerId);
    if (empty) {
      room.dispose();
      this.rooms.delete(room.code);
    }
  }

  /** 모집 중(비공개 아님·진행 중 아님·정원 미달)인 공개방 요약 목록 */
  list(): RoomSummary[] {
    return Array.from(this.rooms.values())
      .filter((room) => room.isPublic && !room.inGame && room.players.length < room.settings.mode)
      .map((room) => ({
        code: room.code,
        hostName: room.players.find((p) => p.id === room.hostId)?.name ?? '',
        playerCount: room.players.length,
        mode: room.settings.mode,
      }));
  }

  /** 서버 종료용 — 모든 방·세션·타이머 정리 */
  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.memberships.clear();
  }
}
