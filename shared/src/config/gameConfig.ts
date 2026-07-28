/**
 * 게임 규칙 상수 — docs/requirements.md 1번(방 설정)·2번(타이머) 섹션 기반
 *
 * 규칙 관련 숫자는 코드에 하드코딩하지 말고 반드시 이 파일에서 가져다 쓴다.
 * 값의 근거는 각 항목의 주석(문서 섹션 번호)을 따른다.
 */

/** 방(로비) 생성 옵션 — 1번 섹션 (6인 → 7인 모드로 변경 확정) */
export const ROOM_OPTIONS = {
  /** 인원수 모드 */
  playerModes: [7, 9],
  /** 개인 발언시간(초) — 방장이 선택 */
  personalSpeechSeconds: [80, 120],
  /** 전체 토론시간(초) — 방장이 선택 (3분 / 5분) */
  discussionSeconds: [180, 300],
} as const;

/** 방장이 선택한 타이머 설정 — 서버 권위 타이머가 낮 개인 발언·전체 토론 길이에 사용 */
export interface RoomTimerSettings {
  personalSpeechSeconds: (typeof ROOM_OPTIONS.personalSpeechSeconds)[number];
  discussionSeconds: (typeof ROOM_OPTIONS.discussionSeconds)[number];
}

export const DEFAULT_ROOM_TIMER_SETTINGS: RoomTimerSettings = {
  personalSpeechSeconds: ROOM_OPTIONS.personalSpeechSeconds[0],
  discussionSeconds: ROOM_OPTIONS.discussionSeconds[0],
};

/**
 * 대기방(로비)에서 로그인 유저의 소켓이 끊긴 뒤 실제로 방에서 제거되기까지의 유예 시간(초) —
 * 1번 섹션 "새로고침·재접속 복구". 이 안에 재접속하면 그대로 유지된다.
 */
export const RECONNECT_GRACE_SECONDS = 30;

/** 서버 사이드 타이머(초) — 2번 섹션 표 */
export const TIMER_CONFIG = {
  /** 밤: 악 진영 스킬 사용 결정 (2번 섹션 표 — 10초로 확정됨) */
  nightEvilSkillDecision: 10,
  /**
   * 밤: 악 진영 개별 스킬 시간 (4번 섹션 5항 — 저승사자 길동무·구미호 유혹). 10초에서
   * 15초로 연장 — 선 진영 스킬 창과 같은 이유로 타이머 레이스 완화.
   */
  nightEvilIndividualSkill: 15,
  /** 밤: 악 진영 토론 */
  nightEvilDiscussion: 90,
  /**
   * 밤: 선 진영 전체 스킬 결정 (해태·도깨비·자청비 부활꽃/멸망꽃 — 4번 섹션, 동시 진행).
   * 10초에서 15초로 연장 — 특히 자청비의 멸망꽃은 대상 선택창을 한 번 더 거쳐야 해서
   * 막판에 서버 타이머와 클라이언트 클릭이 경합하는 사례가 있었다.
   */
  nightGoodSkillDecision: 15,
  /** 밤: 도깨비 스킬 결정 */
  nightDokkaebiDecision: 10,
  /** 투표 시간 */
  vote: 10,
  /**
   * 처형 투표(재투표 포함) 종료 직후: 누가 누구에게 투표했는지 공개(9번 피드백). 이 시간이
   * 끝나야 다음 단계(밤·최후의 변론·동시 발언)로 넘어간다 — game:voteResult의 durationMs도
   * 이 값과 맞춘다
   */
  voteReveal: 5,
  /** 낮 투표 확정 직후: 최후의 변론 (처형 대상자 채팅) */
  finalPlea: 20,
  /**
   * 사망 확정 시: 장화홍련 피 맺힌 유서 대상 선택. 10초에서 15초로 연장 — 자청비 스킬 창과
   * 같은 이유로, 대상 선택 후 확정 클릭까지 걸리는 시간이 막판 서버 타이머와 경합하는
   * 사례가 있었다.
   */
  deathJanghwaDecision: 15,
  /** 사망 확정 시: 조언자 방울 승계/파기 선택 */
  deathAdvisorDecision: 10,
  /** 처형 투표 동표 시: 최다득표자 동시 발언 */
  tieSpeech: 20,
  /** 첫날 아침: 조언자 출마 신청 */
  advisorCandidacy: 7,
  /** 첫날 아침: 출마자 개인 어필 발언 (각자) */
  advisorAppeal: 20,
  /** 첫날 아침: 조언자 선출 토론 */
  advisorDiscussion: 50,
  /** 첫날 아침: 조언자 선출 투표 */
  advisorVote: 7,
  /** 투항: 최초 클릭 후 팀 전원 동의 대기 */
  surrenderConsent: 30,
} as const;
