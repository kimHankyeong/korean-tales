/**
 * PublicGameState → 지금 이 클라이언트가 보여줘야 할 행동 프롬프트 매핑.
 * 서버 상태 경로 문자열은 server/src/game/machine.ts의 상태 id를 그대로 따른다
 * (예: "day.vote", "night.evilSkills") — server/src/game/publicState.ts의 phasePath()가 만든 값.
 * 최종 유효성은 server/src/game/actionAuth.ts가 다시 검증하므로, 여기서는 UX 가드 역할만 한다.
 *
 * 어필 발언(firstMorning.appeal) 중 "현재 발언자가 누구인지"는 PublicGameState에 없지만,
 * 타이머 키(server/src/game/session.ts의 getTimerSpec)가 `appeal:<playerId>` 형태로 현재
 * 발언자 id를 담고 있어 timer:sync의 phaseKey로 판별한다.
 */

import type { ClientGameAction, GameRolePayload, PublicGameState } from '@korean-tales/shared';

export type ActivePrompt =
  | {
      kind: 'SELECT';
      title: string;
      buttonLabel: '투표하기' | '선택하기';
      /** 대상 후보 제한 (조언자 선출 등) — 없으면 생존자 전원 */
      candidateIds?: string[];
      allowAbstain?: boolean;
      allowForgo?: boolean;
      excludeSelf?: boolean;
      buildAction: (targetId: string) => ClientGameAction;
      forgoAction?: ClientGameAction;
    }
  | { kind: 'BUTTON'; label: string; action: ClientGameAction }
  | { kind: 'SKIP' }
  | { kind: 'FLOWER' };

export function resolveActivePrompt(
  state: PublicGameState,
  myRole: GameRolePayload | null,
  myId: string,
  /** 현재 활성 타이머의 phaseKey (timer:sync) — 어필 발언 현재 차례 판별용 */
  timerPhaseKey: string | null = null,
): ActivePrompt | null {
  const { phase, awaiting } = state;

  // 사망 확정 트리거 응답 대기 — 어느 페이즈든 최우선
  if (awaiting?.playerId === myId) {
    if (awaiting.kind === 'GRUDGE') {
      return {
        kind: 'SELECT',
        title: '피 맺힌 유서 — 함께 데려갈 사람',
        buttonLabel: '선택하기',
        allowForgo: true,
        excludeSelf: true,
        buildAction: (targetId) => ({ type: 'GRUDGE_TARGET', targetId }),
        forgoAction: { type: 'GRUDGE_FORGO' },
      };
    }
    return {
      kind: 'SELECT',
      title: '방울 승계 — 다음 조언자 지목 (포기 시 파기)',
      buttonLabel: '선택하기',
      allowForgo: true,
      buildAction: (targetId) => ({ type: 'ADVISOR_SUCCEED', targetId }),
      forgoAction: { type: 'ADVISOR_DESTROY' },
    };
  }

  // 사망자는 관전만 가능 — 투표·스킬·발언 어떤 프롬프트도 뜨지 않는다.
  // (자신의 사망 확정 트리거 응답은 위에서 이미 처리되어 여기까지 오지 않음)
  if (!state.players.find((p) => p.id === myId)?.alive) return null;

  switch (phase) {
    case 'firstMorning.appeal':
      return timerPhaseKey === `appeal:${myId}` ? { kind: 'SKIP' } : null;

    case 'firstMorning.candidacy':
      return state.candidates.includes(myId)
        ? null
        : { kind: 'BUTTON', label: '조언자 출마 신청', action: { type: 'CANDIDACY_APPLY', playerId: myId } };

    case 'firstMorning.electionVote':
      return state.candidates.includes(myId)
        ? null
        : {
            kind: 'SELECT',
            title: '조언자 선출 투표',
            buttonLabel: '투표하기',
            candidateIds: state.candidates,
            buildAction: (targetId) => ({ type: 'VOTE', voterId: myId, targetId }),
          };

    case 'firstMorning.electionRevote':
      return state.candidates.includes(myId)
        ? null
        : {
            kind: 'SELECT',
            title: '조언자 선출 재투표',
            buttonLabel: '투표하기',
            candidateIds: state.tieCandidates,
            buildAction: (targetId) => ({ type: 'VOTE', voterId: myId, targetId }),
          };

    case 'day.flowerDecision':
      return myRole?.characterId === 'jacheongbi' ? { kind: 'FLOWER' } : null;

    case 'day.personalSpeech':
      return state.currentSpeakerId === myId ? { kind: 'SKIP' } : null;

    case 'day.discussion':
    case 'night.evilDiscussion':
      return { kind: 'SKIP' };

    case 'day.vote':
      return {
        kind: 'SELECT',
        title: '처형 투표',
        buttonLabel: '투표하기',
        allowAbstain: true,
        buildAction: (targetId) => ({ type: 'VOTE', voterId: myId, targetId }),
      };

    case 'day.revote':
      return {
        kind: 'SELECT',
        title: '처형 재투표',
        buttonLabel: '투표하기',
        allowAbstain: true,
        candidateIds: state.tieCandidates,
        buildAction: (targetId) => ({ type: 'VOTE', voterId: myId, targetId }),
      };

    case 'day.finalPlea':
      return state.executionTargetId === myId ? { kind: 'SKIP' } : null;

    case 'night.goodSkills':
      if (myRole?.characterId === 'haetae') {
        return {
          kind: 'SELECT',
          title: '투사 — 조사 대상 선택',
          buttonLabel: '선택하기',
          excludeSelf: true,
          buildAction: (targetId) => ({ type: 'HAETAE_INVESTIGATE', targetId }),
        };
      }
      if (myRole?.characterId === 'dokkaebi') {
        return {
          kind: 'SELECT',
          title: '도깨비 장난 — 보호할 사람',
          buttonLabel: '선택하기',
          buildAction: (targetId) => ({ type: 'DOKKAEBI_PRANK', targetId }),
        };
      }
      return null;

    case 'night.evilVote':
      return myRole?.faction === 'EVIL'
        ? {
            kind: 'SELECT',
            title: '처치 대상 투표',
            buttonLabel: '투표하기',
            buildAction: (targetId) => ({ type: 'EVIL_KILL_VOTE', voterId: myId, targetId }),
          }
        : null;

    case 'night.evilSkills':
      if (myRole?.characterId === 'jeoseung') {
        return {
          kind: 'SELECT',
          title: '길동무 — 함께 데려갈 사람',
          buttonLabel: '선택하기',
          excludeSelf: true,
          buildAction: (targetId) => ({ type: 'JEOSEUNG_COMPANION', targetId }),
        };
      }
      if (myRole?.characterId === 'gumiho') {
        return { kind: 'BUTTON', label: '유혹하기', action: { type: 'GUMIHO_SEDUCE' } };
      }
      return null;

    default:
      return null;
  }
}
