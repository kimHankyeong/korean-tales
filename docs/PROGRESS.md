# 진행 기록 (PROGRESS)

## 세션 2 완료: 게임 상태 머신(FSM) 구현 (2026-07-12)

- `server/src/game/`에 XState v5 기반 전체 상태 머신 구현 (타이머·소켓 미연결 — 시간 만료는 외부 `TIME_UP` 이벤트로 주입)
  - `types.ts` — 런타임 타입 (GamePlayer·GameContext·GameEvent·PendingDeath 등)
  - `logic.ts` — **순수 전이 로직**: 투표 판정(기권/동표 규칙), 밤 킬 판정, 승리 판정, 해태 투사, 사망 큐 처리(트리거 연쇄), 새벽 처리(연민 부활·장난 킬 무효), 부활꽃 대상 판정
  - `machine.ts` — 상태 흐름: 게임시작 → 첫날 아침(조언자 선출: 출마→어필→토론→투표→동표 재투표) → 낮/밤 반복 → 게임종료. 각 전이 조건 주석 명시
  - 사망 확정 트리거는 `resolveDeaths` 서브 상태로 공통 처리: 저승사자(길동무 동반, 자동) / 장화홍련(피 맺힌 유서, 입력 대기) / 조언자(방울 승계·파기, 입력 대기) / 까치선비(연민 부활 예약, 자동) — 연쇄 사망 지원
- 상태 전이 다이어그램 `docs/fsm.md` 작성 (mermaid) — 설계상 가정/미결 사항 표 포함
- 단위 테스트 32개 통과 (`logic.test.ts` 17개 + `machine.test.ts` 시나리오 15개: 선출 동표→무작위, 전원 기권, 유혹 투표 스킵, 부활꽃, 도깨비 장난, 유서 동반 사망, 방울 승계, 까치선비 부활+중립 전환, 악 전멸 승리 등)
- 세션 1 미결 사항 확정 내용을 규칙 문서에 반영 (`requirements.md`):
  - 도깨비 장난 밤에도 악 진영 처치 투표는 그대로 진행하되 차단 사실 비공개 (아침 "사망자 없음")
  - **중립 승리 조건** = 악 진영 전원 탈락 시점에 중립 1인 이상 생존 시 선 진영과 함께 승리 (`FACTION_META.NEUTRAL.winCondition` 갱신 — 승패 전이에는 영향 없음)
- shared 보강: `Skill.reviverCharacterId` 필드 추가 (까치의 보은 → 바리공주 연결을 데이터로 표현)

### 설계상 가정 (docs/fsm.md 표 참고 — 확정 시 requirements.md 갱신 후 코드 반영)
- 1일차는 조언자 선출 직후 낮 토론부터 시작 (꽃 단계 없음)
- 선출 무득표·악 처치 투표 동률 → 무작위 / 밤 사망자의 트리거는 꽃 단계 이후 처리(부활 시 미발동) / 동시 전멸 시 선 승리
- 투항(30초 팀 동의)·P버튼은 소켓 연동 세션에서 이벤트로 추가 예정

### ⚠️ 환경 이슈: Node 24.11.1(Windows)에서 `vite build` 크래시
- 증상: 모듈 transform 직후 exit code `3221226505 (0xC0000409, STATUS_STACK_BUFFER_OVERRUN)`로 조용히 사망
- 원인 분리 실험: rollup native→WASM 교체, tailwind 제거, minify 비활성, V8 플래그 변경 모두 무효 → **Node 22.23.1로 실행하면 동일 빌드가 정상 완료** (Node 24.11.1 자체 문제로 확정)
- 현재 상태: dev 서버·vitest·typecheck는 Node 24에서도 정상. **빌드만 Node 22 LTS 필요**
- 권장: 시스템 Node를 22 LTS로 교체하거나 nvm-windows 등으로 22를 병행 설치

### 미결/주의 사항
- 6인 모드 로스터 구성 미정 (`ROSTER_BY_MODE[6] = null`)
- 레거시 폴더(`frontreact/`, 루트 `src/`·`public/`, `back/`) 정리 여부 미정

## 이전 세션

### 세션 1 완료: 캐릭터/스킬 데이터 모델 확정 (2026-07-12)
- `characterModel.ts` 타입 전용 재설계 (EVIL/GOOD/NEUTRAL, 사용 횟수·시점·패시브·포기 가능 필드, 특수 규칙 필드), 인스턴스 데이터 `config/characters.ts` 분리, 모드별 로스터 `config/roster.ts` 신설
- requirements.md "악 진영 스킬 사용 결정" 15초 → 10초 확정 반영, 데이터 정합성 테스트 14개

### 세션 0 완료: 프로젝트 세팅 (2026-07-12)
- npm workspaces 모노레포(client/server/shared), 기술 스택 세팅, CLAUDE.md, docs/requirements.md 배치
- 게임 규칙 상수 `gameConfig.ts` 분리, 서버는 Socket.io 연결 스켈레톤만 존재

## 다음 세션 할 일 (세션 3)

- **타이머 시스템** (requirements 10번 4단계): 서버 권위 타이머 구현
  - `TIMER_CONFIG` 기반으로 각 상태 진입 시 타이머 시작 → 만료 시 머신에 `TIME_UP` 발행
  - 클라이언트 카운트다운 동기화용 남은 시간 브로드캐스트 설계
  - Skip 조기 종료(개인 발언·전체 토론: 생존자 전원 skip 집계) 연결
- 이후: 5단계 투표/스킬 선택 공용 UI → 6단계 투표 결과 판정 연결 → 7단계 승리 조건(투항 30초 팀 동의 포함)
