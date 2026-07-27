/**
 * 클라이언트 액션 권한 검증 — 정보 은닉·부정 방지의 핵심.
 *
 * 소켓으로 들어온 액션은 머신에 주입되기 전에 반드시 여기서 검증한다:
 * - 남의 이름으로 투표/스킵 불가 (voterId/playerId == 발신자)
 * - 캐릭터 전용 스킬은 해당 캐릭터 본인만 (해태 조사, 자청비 꽃, 저승사자 길동무 등)
 * - 사망 트리거 응답(유서/승계)은 대기 중인 당사자만
 * - 서버 전용 이벤트(TIME_UP·TEAM_SURRENDER)는 타입에서 이미 제외(ClientGameAction),
 *   런타임에서도 switch default로 거부된다
 *
 * 세부 유효성(생존 여부·사용 횟수·페이즈)은 머신 guard가 이중으로 검증한다.
 */

import type { CharacterId, ClientGameAction } from '@korean-tales/shared';
import type { GameSnapshot } from './session';

function isCharacter(snapshot: GameSnapshot, senderId: string, characterId: CharacterId): boolean {
  const sender = snapshot.context.players.find((p) => p.id === senderId);
  return sender?.characterId === characterId;
}

export function isActionAllowed(
  senderId: string,
  action: ClientGameAction,
  snapshot: GameSnapshot,
): boolean {
  const { context } = snapshot;
  if (!context.players.some((p) => p.id === senderId)) return false;

  switch (action.type) {
    /* 본인 명의 강제 */
    case 'VOTE':
      return action.voterId === senderId;
    case 'SKIP':
    case 'CANDIDACY_APPLY':
    case 'FORFEIT':
      return action.playerId === senderId;

    /* 역할 전용 */
    case 'ADVISOR_DIRECTION':
      return context.advisorId === senderId;
    case 'FLOWER_REVIVE':
    case 'FLOWER_DOOM':
    case 'FLOWER_PASS':
      return isCharacter(snapshot, senderId, 'jacheongbi');
    case 'HAETAE_INVESTIGATE':
      return isCharacter(snapshot, senderId, 'haetae');
    case 'DOKKAEBI_PRANK':
      return isCharacter(snapshot, senderId, 'dokkaebi');
    case 'JEOSEUNG_COMPANION':
      return isCharacter(snapshot, senderId, 'jeoseung');
    case 'GUMIHO_SEDUCE':
      return isCharacter(snapshot, senderId, 'gumiho');
    case 'EVIL_KILL_VOTE': {
      const sender = context.players.find((p) => p.id === senderId);
      return action.voterId === senderId && sender?.faction === 'EVIL';
    }

    /* 사망 트리거 응답 — 대기 중인 당사자만 */
    case 'GRUDGE_TARGET':
    case 'GRUDGE_FORGO':
      return context.awaiting?.kind === 'GRUDGE' && context.awaiting.playerId === senderId;
    case 'ADVISOR_SUCCEED':
    case 'ADVISOR_DESTROY':
      return context.awaiting?.kind === 'SUCCESSION' && context.awaiting.playerId === senderId;

    default:
      return false; // 알 수 없는/서버 전용 이벤트
  }
}
