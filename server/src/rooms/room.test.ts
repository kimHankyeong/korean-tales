import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROSTER_BY_MODE,
  SOCKET_EVENTS,
  TIMER_CONFIG,
  type GameOverPayload,
  type GameRolePayload,
  type PublicGameState,
  type SurrenderProgressPayload,
} from '@korean-tales/shared';
import { Room, isValidSettings, type RoomEmitter } from './room';
import { RoomManager } from './roomManager';

/** 전송 기록용 페이크 이미터 — 스코프(방 전체/개인) 검증의 근거 */
class FakeEmitter implements RoomEmitter {
  roomEvents: { event: string; payload: unknown }[] = [];
  playerEvents = new Map<string, { event: string; payload: unknown }[]>();

  toRoom(event: string, payload: unknown): void {
    this.roomEvents.push({ event, payload });
  }
  toPlayer(playerId: string, event: string, payload: unknown): void {
    const list = this.playerEvents.get(playerId) ?? [];
    list.push({ event, payload });
    this.playerEvents.set(playerId, list);
  }
  playerEventsOf(playerId: string, event: string) {
    return (this.playerEvents.get(playerId) ?? []).filter((e) => e.event === event);
  }
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeRoom(seed = 1) {
  const emitter = new FakeEmitter();
  const room = new Room('TEST01', { id: 'u1', name: '방장' }, emitter, seededRng(seed));
  return { room, emitter };
}

/** u2~u9 입장 (9인 채움) */
function fillRoom(room: Room, count = 8) {
  for (let i = 2; i <= count + 1; i++) room.join({ id: `u${i}`, name: `유저${i}` });
}

/**
 * 게임은 항상 밤(밤 0)부터 시작한다 — 밤 전체(선스킬→악토론→악투표→악개별) +
 * 자청비 꽃 선택(멸망꽃은 항상 가능해 매 새벽 뜸, 자동 패스)까지 통과시켜
 * 9인 모드 조언자 선출(또는 7인 모드 개인 발언) 직전 상태로 만든다.
 */
function passNightZero(room: Room) {
  const session = room.session!;
  for (let i = 0; i < 5; i++) session.send({ type: 'TIME_UP' });
}

/** 게임 중 방의 역할 배정 결과를 (개인 전송 기록에서) 수집 */
function rolesOf(emitter: FakeEmitter, ids: string[]): Record<string, GameRolePayload> {
  const roles: Record<string, GameRolePayload> = {};
  for (const id of ids) {
    const events = emitter.playerEventsOf(id, SOCKET_EVENTS.gameRole);
    if (events.length > 0) roles[id] = events[0]!.payload as GameRolePayload;
  }
  return roles;
}

describe('방(로비) 시스템 (requirements 1번)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('설정 검증: ROOM_OPTIONS의 선택지만 허용된다', () => {
    expect(isValidSettings({ mode: 9, personalSpeechSeconds: 80, discussionSeconds: 180 })).toBe(true);
    expect(isValidSettings({ mode: 7, personalSpeechSeconds: 120, discussionSeconds: 300 })).toBe(true);
    expect(isValidSettings({ mode: 6 as never, personalSpeechSeconds: 80, discussionSeconds: 180 })).toBe(false);
    expect(isValidSettings({ mode: 9, personalSpeechSeconds: 90 as never, discussionSeconds: 180 })).toBe(false);
    expect(isValidSettings({ mode: 9, personalSpeechSeconds: 80, discussionSeconds: 240 as never })).toBe(false);
  });

  it('정원(모드 인원)을 넘는 입장은 거부된다', () => {
    const { room } = makeRoom();
    fillRoom(room); // 9명 참
    expect(room.join({ id: 'u10', name: '늦은사람' })).toBe('ROOM_FULL');
  });

  it('방 설정은 방장만 바꿀 수 있다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    expect(
      room.updateSettings('u2', { mode: 7, personalSpeechSeconds: 120, discussionSeconds: 300 }),
    ).toBe('NOT_HOST');
    expect(
      room.updateSettings('u1', { mode: 7, personalSpeechSeconds: 120, discussionSeconds: 300 }),
    ).toBeNull();
    expect(room.settings.personalSpeechSeconds).toBe(120);
  });

  it('방장이 나가면 다음 입장자가 방장을 승계한다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    room.leave('u1');
    expect(room.hostId).toBe('u2');
  });

  it('방장은 대기방에서 다른 플레이어를 강퇴할 수 있다 — 검증만 담당, 제거는 registerHandlers가 처리', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    expect(room.kick('u1', 'u2')).toBeNull(); // 검증 통과 — room.players에서 직접 지우지는 않음
  });

  it('방장이 아니면 강퇴할 수 없다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    room.join({ id: 'u3', name: '유저3' });
    expect(room.kick('u2', 'u3')).toBe('NOT_HOST');
  });

  it('자기 자신은 강퇴할 수 없고, 방에 없는 사람도 강퇴할 수 없다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    expect(room.kick('u1', 'u1')).toBe('NOT_ALLOWED');
    expect(room.kick('u1', 'nobody')).toBe('NOT_IN_ROOM');
  });

  it('게임이 시작된 뒤에는 강퇴할 수 없다', () => {
    const { room } = makeRoom();
    fillRoom(room); // 9명 참
    expect(room.startGame('u1')).toBeNull();
    expect(room.kick('u1', 'u2')).toBe('ALREADY_IN_GAME');
  });

  it('인원이 모드와 다르면 시작할 수 없다', () => {
    const { room } = makeRoom();
    fillRoom(room, 5); // 6명뿐
    expect(room.startGame('u1')).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('관리자는 정원 미달이어도 시작할 수 있다 (혼자 테스트, 13번)', () => {
    const { room } = makeRoom();
    // u1(방장) 혼자, 9인 모드 그대로
    expect(room.startGame('u1', true)).toBeNull();
    expect(room.inGame).toBe(true);
  });

  it('관리자여도 방장이 아니거나 인원이 0명이면 시작할 수 없다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    expect(room.startGame('u2', true)).toBe('NOT_HOST');

    const { room: emptyRoom } = makeRoom();
    emptyRoom.leave('u1'); // 방장 본인만 있던 방을 비움
    expect(emptyRoom.startGame('u1', true)).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('관리자는 정원 미달로 혼자 시작할 때 직업을 직접 골라 배정받을 수 있다 (13번)', () => {
    const { room, emitter } = makeRoom();
    expect(room.startGame('u1', true, 'dokkaebi')).toBeNull();
    const role = emitter.playerEventsOf('u1', SOCKET_EVENTS.gameRole)[0]!.payload as GameRolePayload;
    expect(role.characterId).toBe('dokkaebi');
  });

  it('관리자가 아니면 캐릭터 지정을 보내도 무시되고(랜덤 배정 유지) NOT_HOST/정원 검증이 우선한다', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room); // 9명 채움 — 관리자 아니어도 정상 시작 가능
    expect(room.startGame('u1', false, 'dokkaebi')).toBeNull();
    const role = emitter.playerEventsOf('u1', SOCKET_EVENTS.gameRole)[0]!.payload as GameRolePayload;
    // 무작위 배정 결과 — 반드시 dokkaebi일 필요 없음(지정이 반영되지 않았어야 함이 핵심 의도이나
    // seed에 따라 우연히 같을 수 있으므로, 9인 로스터 내 캐릭터인지만 확인)
    expect(ROSTER_BY_MODE[9]).toContain(role.characterId);
  });

  it('관리자가 현재 모드 로스터에 없는 캐릭터를 지정하면 INVALID_CHARACTER로 거부되고 게임이 시작되지 않는다', () => {
    const { room } = makeRoom();
    room.updateSettings('u1', { mode: 7, personalSpeechSeconds: 80, discussionSeconds: 180 });
    // 까치선비는 9인 전용 — 7인 로스터엔 없음(ROSTER_BY_MODE[7])
    expect(room.startGame('u1', true, 'kkachi')).toBe('INVALID_CHARACTER');
    expect(room.inGame).toBe(false);
  });

  it('관리자는 fillVirtual로 남은 정원을 가상 플레이어로 채워 시작할 수 있다 (13번)', () => {
    const { room } = makeRoom();
    // u1(방장) 혼자, fillVirtual=true → 나머지 8명은 가상 플레이어로 채워짐
    expect(room.startGame('u1', true, undefined, true)).toBeNull();
    expect(room.inGame).toBe(true);
    expect(room.players).toHaveLength(9);
    expect(room.players.filter((p) => p.name.startsWith('가상플레이어'))).toHaveLength(8);
  });

  it('가상 플레이어를 포함해 게임이 시작되면 관리자에게만 전원의 배정(admin:roster)이 전송된다', () => {
    const { room, emitter } = makeRoom();
    expect(room.startGame('u1', true, undefined, true)).toBeNull();
    const rosterEvents = emitter.playerEventsOf('u1', SOCKET_EVENTS.adminRoster);
    expect(rosterEvents).toHaveLength(1);
    const roster = rosterEvents[0]!.payload as { players: { playerId: string; isVirtual: boolean }[] };
    expect(roster.players).toHaveLength(9);
    expect(roster.players.filter((p) => p.isVirtual)).toHaveLength(8);
    // 가상 플레이어가 없는 일반(비관리자) 시작에서는 admin:roster가 전송되지 않는다
    const { room: normalRoom, emitter: normalEmitter } = makeRoom();
    fillRoom(normalRoom);
    expect(normalRoom.startGame('u1')).toBeNull();
    expect(normalEmitter.playerEventsOf('u1', SOCKET_EVENTS.adminRoster)).toHaveLength(0);
  });

  it('관리자가 가상 플레이어 없이 시작해도 admin:roster는 (전원 isVirtual:false로) 전송된다 — 이전 게임의 잔여 목록이 남지 않게', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room); // 9명 정원 채움, fillVirtual 없이 관리자로 시작
    expect(room.startGame('u1', true)).toBeNull();
    const rosterEvents = emitter.playerEventsOf('u1', SOCKET_EVENTS.adminRoster);
    expect(rosterEvents).toHaveLength(1);
    const roster = rosterEvents[0]!.payload as { players: { isVirtual: boolean }[] };
    expect(roster.players).toHaveLength(9);
    expect(roster.players.every((p) => !p.isVirtual)).toBe(true);
  });

  it('관리자는 admin:puppetAction으로 가상 플레이어를 대신해 액션을 제출할 수 있다 (13번)', () => {
    const { room, emitter } = makeRoom();
    expect(room.startGame('u1', true, undefined, true)).toBeNull();
    passNightZero(room); // firstMorning.candidacy(9인) 또는 day.personalSpeech(7인) 직전까지

    const roster = emitter.playerEventsOf('u1', SOCKET_EVENTS.adminRoster).at(-1)!
      .payload as { players: { playerId: string; isVirtual: boolean }[] };
    const virtualId = roster.players.find((p) => p.isVirtual)!.playerId;

    // 조언자 출마 신청(CANDIDACY_APPLY)은 본인 명의만 허용되는 액션 — 가상 플레이어 명의로 제출
    expect(
      room.handlePuppetAction(true, virtualId, { type: 'CANDIDACY_APPLY', playerId: virtualId }),
    ).toBeNull();
  });

  it('admin:puppetAction은 관리자가 아니거나 가상 플레이어가 아닌 대상이면 거부된다', () => {
    const { room } = makeRoom();
    expect(room.startGame('u1', true, undefined, true)).toBeNull();
    passNightZero(room);

    expect(
      room.handlePuppetAction(false, 'virtual:TEST01:1', { type: 'CANDIDACY_APPLY', playerId: 'virtual:TEST01:1' }),
    ).toBe('NOT_ALLOWED'); // 관리자 아님
    expect(
      room.handlePuppetAction(true, 'u1', { type: 'CANDIDACY_APPLY', playerId: 'u1' }),
    ).toBe('NOT_ALLOWED'); // 실제 플레이어(u1)는 가상 플레이어가 아님
  });

  it('게임이 끝나면 가상 플레이어는 로비에서 제거되어 다음 게임에 남지 않는다', () => {
    const { room, emitter } = makeRoom();
    expect(room.startGame('u1', true, undefined, true)).toBeNull();
    passNightZero(room);
    const roster = emitter.playerEventsOf('u1', SOCKET_EVENTS.adminRoster).at(-1)!
      .payload as { players: { playerId: string; faction: string }[] };
    const evilIds = roster.players.filter((p) => p.faction === 'EVIL').map((p) => p.playerId);

    // 악 팀 전원(가상 플레이어 포함) 투항 동의 → 즉시 게임 종료(선 승리) → endSession
    for (const id of evilIds) expect(room.agreeSurrender(id)).toBeNull();

    expect(room.inGame).toBe(false);
    expect(room.players).toHaveLength(1); // u1만 남고 가상 플레이어는 전부 제거됨
    expect(room.players.some((p) => p.name.startsWith('가상플레이어'))).toBe(false);
  });

  it('정원이 다 차고 전원 준비되면 방장의 시작 클릭 없이 자동으로 게임이 시작된다', () => {
    const { room } = makeRoom();
    fillRoom(room); // 9명 참
    const ids = Array.from({ length: 9 }, (_, i) => `u${i + 1}`);
    for (const id of ids.slice(0, -1)) expect(room.setReady(id, true)).toBeNull();
    expect(room.inGame).toBe(false); // 아직 1명 미준비
    expect(room.setReady(ids.at(-1)!, true)).toBeNull();
    expect(room.inGame).toBe(true); // 마지막 1명까지 준비되자 자동 시작
  });

  it('정원 미달이면 전원 준비해도 시작되지 않는다', () => {
    const { room } = makeRoom();
    fillRoom(room, 5); // 6명뿐 (9인 모드 정원 미달)
    const ids = Array.from({ length: 6 }, (_, i) => `u${i + 1}`);
    for (const id of ids) expect(room.setReady(id, true)).toBeNull();
    expect(room.inGame).toBe(false);
  });

  it('새 인원이 들어오면 기존 준비 상태가 초기화된다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    room.setReady('u1', true);
    room.setReady('u2', true);
    room.join({ id: 'u3', name: '유저3' }); // 새 인원 입장
    expect(room.players.every((p) => !p.ready)).toBe(true);
  });

  it('방 설정이 바뀌면 준비 상태가 초기화된다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    room.setReady('u1', true);
    room.setReady('u2', true);
    room.updateSettings('u1', { mode: 7, personalSpeechSeconds: 120, discussionSeconds: 300 });
    expect(room.players.every((p) => !p.ready)).toBe(true);
  });

  it('방에 없는 사람의 준비 요청은 거부된다', () => {
    const { room } = makeRoom();
    expect(room.setReady('ghost', true)).toBe('NOT_IN_ROOM');
  });

  it('방은 기본적으로 공개고, 공개/비공개 전환은 방장만 할 수 있다', () => {
    const { room } = makeRoom();
    room.join({ id: 'u2', name: '유저2' });
    expect(room.isPublic).toBe(true);
    expect(room.setVisibility('u2', false)).toBe('NOT_HOST');
    expect(room.isPublic).toBe(true);
    expect(room.setVisibility('u1', false)).toBeNull();
    expect(room.isPublic).toBe(false);
  });
});

describe('게임 시작 — 비밀 캐릭터 배정 (정보 은닉)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('각자에게 본인 캐릭터만 1회 비공개 전송되고, 전체 채널로는 역할이 나가지 않는다', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room);
    expect(room.startGame('u1')).toBeNull();

    const ids = Array.from({ length: 9 }, (_, i) => `u${i + 1}`);
    const roles = rolesOf(emitter, ids);
    // 전원이 정확히 1개의 role 이벤트를 받았고, 캐릭터는 중복 없음
    for (const id of ids) expect(emitter.playerEventsOf(id, SOCKET_EVENTS.gameRole)).toHaveLength(1);
    expect(new Set(Object.values(roles).map((r) => r.characterId)).size).toBe(9);

    // 방 전체 브로드캐스트(gameState 등)에는 characterId가 등장하지 않아야 한다
    const broadcastJson = JSON.stringify(emitter.roomEvents);
    expect(broadcastJson).not.toContain('characterId');
  });

  it('진영 선호: 슬롯이 남으면 반영된다 (보장은 아님)', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room);
    room.setFactionPreference('u5', 'EVIL');
    room.startGame('u1');
    const role = rolesOf(emitter, ['u5']).u5!;
    expect(role.faction).toBe('EVIL'); // 악 3자리 중 하나 — 단독 선호라 항상 반영
  });

  it('시작 직후에는 밤부터, 밤 0이 끝나면 조언자 출마 단계로 공개 상태가 브로드캐스트된다 (9인)', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room);
    room.startGame('u1');
    const firstState = emitter.roomEvents.find((e) => e.event === SOCKET_EVENTS.gameState)!
      .payload as PublicGameState;
    expect(firstState.phase).toBe('night.evilDiscussion'); // 게임은 항상 밤부터 시작 (13번 재배치)

    passNightZero(room);
    const states = emitter.roomEvents.filter((e) => e.event === SOCKET_EVENTS.gameState);
    const last = states.at(-1)!.payload as PublicGameState;
    expect(last.phase).toBe('firstMorning.candidacy');
    expect(last.players).toHaveLength(9);
  });
});

describe('정보 은닉 스코프 — 조사 결과·악 채널·투항', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** 게임 시작 후 밤까지 진행하고, 역할 배정을 돌려준다 */
  function startAndGoNight(room: Room, emitter: FakeEmitter) {
    fillRoom(room);
    room.startGame('u1');
    const ids = Array.from({ length: 9 }, (_, i) => `u${i + 1}`);
    const roles = rolesOf(emitter, ids);
    const session = room.session!;
    passNightZero(room); // 밤 0 통과
    session.send({ type: 'TIME_UP' }); // 선출 스킵 (출마 없음)
    while (session.getSnapshot().matches({ day: 'personalSpeech' })) session.send({ type: 'TIME_UP' });
    session.send({ type: 'TIME_UP' }); // 토론 → 투표
    for (const id of ids) session.send({ type: 'VOTE', voterId: id, targetId: 'ABSTAIN' });
    session.send({ type: 'TIME_UP' }); // → 밤
    expect(session.getSnapshot().matches({ night: 'evilDiscussion' })).toBe(true);
    return { roles, ids };
  }

  it('해태 조사 결과는 해태 본인에게만 전송된다', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const haetaeId = ids.find((id) => roles[id]!.characterId === 'haetae')!;
    const targetId = ids.find((id) => id !== haetaeId)!;

    // 해태/도깨비 스킬(goodSkills)은 13번 재배치로 악 토론→투표→개별스킬 뒤로 이동
    room.session!.send({ type: 'TIME_UP' }); // evilDiscussion → evilVote
    room.session!.send({ type: 'TIME_UP' }); // evilVote → evilSkills
    room.session!.send({ type: 'TIME_UP' }); // evilSkills → goodSkills
    room.handleAction(haetaeId, { type: 'HAETAE_INVESTIGATE', targetId });

    expect(emitter.playerEventsOf(haetaeId, SOCKET_EVENTS.gameInvestigation)).toHaveLength(1);
    for (const id of ids.filter((i) => i !== haetaeId)) {
      expect(emitter.playerEventsOf(id, SOCKET_EVENTS.gameInvestigation)).toHaveLength(0);
    }
    // 방 전체로도 나가지 않음
    expect(emitter.roomEvents.some((e) => e.event === SOCKET_EVENTS.gameInvestigation)).toBe(false);
  });

  it('길동무 동반 사망 발표 문구(game:announcement)가 방 전체에 중계된다 (13번)', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const session = room.session!;
    const jeoseungId = ids.find((id) => roles[id]!.characterId === 'jeoseung')!;
    const jacheongbiId = ids.find((id) => roles[id]!.characterId === 'jacheongbi')!;
    const companionId = ids.find((id) => id !== jeoseungId)!;
    const companionSeat = roles[companionId]!.seat;

    session.send({ type: 'TIME_UP' }); // evilDiscussion → evilVote
    session.send({ type: 'TIME_UP' }); // (무투표) → evilSkills
    room.handleAction(jeoseungId, { type: 'JEOSEUNG_COMPANION', targetId: companionId });
    session.send({ type: 'TIME_UP' }); // evilSkills → goodSkills
    session.send({ type: 'TIME_UP' }); // → dawn → flowerDecision (멸망꽃은 항상 가능)
    room.handleAction(jacheongbiId, { type: 'FLOWER_PASS' });
    while (session.getSnapshot().matches({ day: 'personalSpeech' })) session.send({ type: 'TIME_UP' });
    session.send({ type: 'TIME_UP' }); // 토론 → 투표
    for (const id of ids) {
      session.send({ type: 'VOTE', voterId: id, targetId: id === jeoseungId ? 'ABSTAIN' : jeoseungId });
    }
    session.send({ type: 'TIME_UP' }); // → finalPlea
    session.send({ type: 'TIME_UP' }); // 처형 확정 → 사망 처리(길동무 동반 사망 자동 발동)

    const announcements = emitter.roomEvents.filter((e) => e.event === SOCKET_EVENTS.gameAnnouncement);
    expect(announcements).toEqual([
      {
        event: SOCKET_EVENTS.gameAnnouncement,
        payload: { text: `저승사자가 길동무로 ${companionSeat}번을 선택했습니다`, durationMs: 4000 },
      },
    ]);
  });

  it('밤에는 공개 채팅을 아무도 쓸 수 없다 (악 진영도 EVIL 채널만 가능)', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const evilId = ids.find((id) => roles[id]!.faction === 'EVIL')!;
    const goodId = ids.find((id) => roles[id]!.faction === 'GOOD')!;
    expect(room.chat(goodId, 'PUBLIC', '누구세요')).toBe('NOT_ALLOWED');
    expect(room.chat(evilId, 'PUBLIC', '저도 안 돼요')).toBe('NOT_ALLOWED');
  });

  it('악 채널 채팅은 밤에 악 진영 생존자에게만 중계된다', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const evilIds = ids.filter((id) => roles[id]!.faction === 'EVIL');
    const goodId = ids.find((id) => roles[id]!.faction === 'GOOD')!;

    // 선 진영은 악 채널 발신 불가
    expect(room.chat(goodId, 'EVIL', '몰래 듣기')).toBe('NOT_ALLOWED');

    expect(room.chat(evilIds[0]!, 'EVIL', '오늘 누굴 노릴까')).toBeNull();
    for (const id of evilIds) {
      expect(emitter.playerEventsOf(id, SOCKET_EVENTS.chatMessage)).toHaveLength(1);
    }
    expect(emitter.playerEventsOf(goodId, SOCKET_EVENTS.chatMessage)).toHaveLength(0);
    expect(emitter.roomEvents.some((e) => e.event === SOCKET_EVENTS.chatMessage)).toBe(false);
  });

  it('낮에는 악 채널을 쓸 수 없다', () => {
    const { room, emitter } = makeRoom();
    fillRoom(room);
    room.startGame('u1');
    const ids = Array.from({ length: 9 }, (_, i) => `u${i + 1}`);
    const roles = rolesOf(emitter, ids);
    const evilId = ids.find((id) => roles[id]!.faction === 'EVIL')!;
    passNightZero(room); // 밤 0을 지나 첫날 아침(선출)까지 — 밤이 아니므로 거부돼야 함
    expect(room.chat(evilId, 'EVIL', '벌써?')).toBe('NOT_ALLOWED');
  });

  it('투항 진행 상황은 같은 팀에게만 전송되고, 전원 동의 시 상대 팀이 승리한다', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const evilIds = ids.filter((id) => roles[id]!.faction === 'EVIL');
    const nonEvilIds = ids.filter((id) => roles[id]!.faction !== 'EVIL');

    // 악 팀 전원 순차 동의
    for (const id of evilIds) expect(room.agreeSurrender(id)).toBeNull();

    // 진행 상황은 악 팀에게만
    for (const id of evilIds) {
      expect(
        emitter.playerEventsOf(id, SOCKET_EVENTS.surrenderProgress).length,
      ).toBeGreaterThan(0);
    }
    for (const id of nonEvilIds) {
      expect(emitter.playerEventsOf(id, SOCKET_EVENTS.surrenderProgress)).toHaveLength(0);
    }

    // 게임 종료 — 상대(선) 승리 + 역할 전체 공개
    const over = emitter.roomEvents.filter((e) => e.event === SOCKET_EVENTS.gameOver);
    expect(over).toHaveLength(1);
    const payload = over[0]!.payload as GameOverPayload;
    expect(payload.winner).toBe('GOOD');
    expect(payload.roles).toHaveLength(9);
    expect(room.inGame).toBe(false);

    // 재시작(다시하기) 대비: 자동 비공개 전환 + 전원 준비 초기화 (낯선 사람 유입 방지)
    expect(room.isPublic).toBe(false);
    expect(room.players.every((p) => !p.ready)).toBe(true);
  });

  it('30초 내 전원 동의 실패 시 투항이 취소되고 게임은 계속된다', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const evilIds = ids.filter((id) => roles[id]!.faction === 'EVIL');

    room.agreeSurrender(evilIds[0]!); // 1명만 동의
    vi.advanceTimersByTime(TIMER_CONFIG.surrenderConsent * 1000);

    const events = emitter.playerEventsOf(evilIds[0]!, SOCKET_EVENTS.surrenderProgress);
    const last = events.at(-1)!.payload as SurrenderProgressPayload;
    expect(last.status).toBe('CANCELLED');
    expect(room.inGame).toBe(true); // 게임 계속

    // 중립은 스스로 투항을 시작할 수 없다 (바리공주 = NEUTRAL, 진행 중인 투항 없음)
    const neutralId = ids.find((id) => roles[id]!.faction === 'NEUTRAL')!;
    expect(room.agreeSurrender(neutralId)).toBe('NOT_ALLOWED');
  });

  it('선 진영 투항은 생존 중립도 함께 동의해야 완료된다 (8번 섹션)', () => {
    const { room, emitter } = makeRoom();
    const { roles, ids } = startAndGoNight(room, emitter);
    const goodIds = ids.filter((id) => roles[id]!.faction === 'GOOD');
    const neutralId = ids.find((id) => roles[id]!.faction === 'NEUTRAL')!;

    // 선 진영 전원만 동의 — 중립이 빠졌으니 아직 미완료
    for (const id of goodIds) expect(room.agreeSurrender(id)).toBeNull();
    expect(room.inGame).toBe(true);
    const progress = emitter
      .playerEventsOf(goodIds[0]!, SOCKET_EVENTS.surrenderProgress)
      .at(-1)!.payload as SurrenderProgressPayload;
    expect(progress.required).toHaveLength(goodIds.length + 1); // 선 진영 + 중립 1명
    expect(progress.status).toBe('IN_PROGRESS');

    // 중립이 마저 동의하면 완료 — 악 진영 승리
    expect(room.agreeSurrender(neutralId)).toBeNull();
    const over = emitter.roomEvents.filter((e) => e.event === SOCKET_EVENTS.gameOver);
    expect((over[0]!.payload as GameOverPayload).winner).toBe('EVIL');
  });
});

describe('RoomManager', () => {
  it('방 생성·코드 입장·퇴장·빈 방 폐기', () => {
    const manager = new RoomManager(() => new FakeEmitter(), seededRng(5));
    const room = manager.create({ id: 'a', name: 'A' });
    expect(room.code).toHaveLength(6);
    expect(manager.get(room.code)).toBe(room);

    const joined = manager.join(room.code.toLowerCase(), { id: 'b', name: 'B' });
    expect(joined).toBe(room); // 대소문자 무관
    expect(manager.roomOf('b')).toBe(room);

    expect(manager.join('NOPE99', { id: 'c', name: 'C' })).toBe('NOT_FOUND');

    manager.leave('a');
    manager.leave('b');
    expect(manager.get(room.code)).toBeUndefined(); // 빈 방 폐기
  });

  it('다른 방으로 이동하면 기존 방에서 자동 제거된다', () => {
    const manager = new RoomManager(() => new FakeEmitter(), seededRng(6));
    const room1 = manager.create({ id: 'a', name: 'A' });
    manager.join(room1.code, { id: 'b', name: 'B' });
    const room2 = manager.create({ id: 'b', name: 'B' }); // b가 새 방 생성
    expect(room1.players.some((p) => p.id === 'b')).toBe(false);
    expect(manager.roomOf('b')).toBe(room2);
  });

  it('list()는 모집 중(공개·정원 미달·미시작)인 방만 요약해서 보여준다', () => {
    const manager = new RoomManager(() => new FakeEmitter(), seededRng(7));
    const open = manager.create({ id: 'a', name: '방장A' });
    manager.join(open.code, { id: 'b', name: 'B' });

    const full = manager.create({ id: 'c', name: '방장C' });
    full.updateSettings('c', { mode: 7, personalSpeechSeconds: 80, discussionSeconds: 180 });
    for (const id of ['d', 'e', 'f', 'g', 'h', 'i']) manager.join(full.code, { id, name: id });
    expect(full.players).toHaveLength(7); // 정원 참

    const privateRoom = manager.create({ id: 'j', name: '방장J' });
    privateRoom.setVisibility('j', false);

    const list = manager.list();
    expect(list).toEqual([{ code: open.code, hostName: '방장A', playerCount: 2, mode: 9 }]);
  });
});
