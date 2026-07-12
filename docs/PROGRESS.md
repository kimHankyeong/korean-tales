# 진행 기록 (PROGRESS)

## 세션 1 완료: 캐릭터/스킬 데이터 모델 확정 (2026-07-12)

- `shared/src/characters/characterModel.ts`를 **타입 정의 전용**으로 재설계
  - 진영 `Faction`: `EVIL / GOOD / NEUTRAL`
  - `Skill` 필드: 스킬명, 사용 횟수 제한(`'UNLIMITED' | 1 | 2`), 사용 가능 시점(`NIGHT / MORNING / ON_DEATH_CONFIRMED`), 패시브 여부(`isPassive`), 스킬 포기 가능 여부(`canForgo`)
  - 특수 규칙 필드: 해태 투사 시 표시값(`GameCharacter.investigationResult` — 깡철이는 `NOT_EVIL`), 부활 가능 조건(`revivableCauses`), 동귀어진 봉인 조건(`sealedByDeathCauses` — 멸망꽃 사망 시)
  - FSM 분기용 `effectKind` 태그, 런타임 상태(`PlayerSkillState`·`CompanionMark`·`DeathRecord`) 포함
- 9개 캐릭터 인스턴스 데이터를 `shared/src/config/characters.ts`로 분리 (배경설화 1~2줄 포함, 스킬북 UI용)
- 모드별 로스터 구조 `shared/src/config/roster.ts` 신설 — 9인 모드 확정, **6인 모드는 미정(null)** 로 자리만 마련
- requirements.md 타이머 수정 반영: "악 진영 스킬 사용 결정" 15초 → **10초 확정** (`gameConfig.ts` 갱신, 세션 0 미결 사항 해소)
- 검증: typecheck 전체 통과, Vitest 데이터 정합성 테스트 **14개** 통과, client 프로덕션 빌드 성공(Node 22)

### ⚠️ 환경 이슈: Node 24.11.1(Windows)에서 `vite build` 크래시
- 증상: 모듈 transform 직후 exit code `3221226505 (0xC0000409, STATUS_STACK_BUFFER_OVERRUN)`로 조용히 사망
- 원인 분리 실험: rollup native→WASM 교체, tailwind 제거, minify 비활성, V8 플래그 변경 모두 무효 → **Node 22.23.1로 실행하면 동일 빌드가 정상 완료** (Node 24.11.1 자체 문제로 확정)
- 현재 상태: dev 서버·vitest·typecheck는 Node 24에서도 정상. **빌드만 Node 22 LTS 필요**
- 권장: 시스템 Node를 22 LTS로 교체하거나 nvm-windows 등으로 22를 병행 설치

### 미결/주의 사항
- 6인 모드 로스터 구성 미정 (`ROSTER_BY_MODE[6] = null`)
- 중립 진영(바리공주) 자체 승리 조건 미정
- 도깨비 장난 사용 밤의 "악 투표 진행 여부·차단 사실 공개 여부" 세부 미정 (requirements 3번 비고)
- 레거시 폴더(`frontreact/`, 루트 `src/`·`public/`, `back/`) 정리 여부 미정

## 이전 세션

### 세션 0 완료: 프로젝트 세팅 (2026-07-12)
- npm workspaces 모노레포(client/server/shared), 기술 스택 세팅, CLAUDE.md, docs/requirements.md 배치
- 게임 규칙 상수 `gameConfig.ts` 분리, 서버는 Socket.io 연결 스켈레톤만 존재 (게임 로직 미구현)

## 다음 세션 할 일 (세션 2)

- 게임 상태 머신(FSM) 설계·구현 — requirements 4번(밤)·5번(낮)·7번(조언자 출마) 섹션 기반, XState로 `server/`에 작성
  - 첫날 아침 조언자 선출 → 낮/밤 사이클 → 사망 확정 트리거(저승사자/장화홍련/조언자/까치선비)까지 상태로 표현
  - 각 상태 전이 조건과 다음 상태를 주석으로 명시
  - 스킬 처리 분기는 `Skill.effectKind` 태그 활용
- 이후 순서는 requirements 10번 섹션의 단계별 프롬프트(4단계 타이머 → 5단계 공용 UI → …)를 따른다
