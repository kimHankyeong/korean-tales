/**
 * 로비(방) 상태 — room:state(RoomStatePayload)를 그대로 반영한다.
 */

import { create } from 'zustand';
import type { RoomStatePayload } from '@korean-tales/shared';

export interface RoomState {
  room: RoomStatePayload | null;
  applyRoomState(payload: RoomStatePayload): void;
  leaveRoom(): void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  applyRoomState: (payload) => set({ room: payload }),
  leaveRoom: () => set({ room: null }),
}));
