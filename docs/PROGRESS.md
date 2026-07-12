# 진행 기록 (PROGRESS)

## 세션 3 완료: 서버 권위 타이머 시스템 (2026-07-13)

- `server/src/game/timer.ts` — `PhaseTimer`: 페이즈당 하나의 서버 타이머 (시작/취소/남은 시간)
- `server/src/game/session.ts` — `GameSession`: 상태 머신과 타이머 결합
  - 상태 전이 구독 → 시간 제한 있는 상태 진입 시 타이머 시작 → 만료 시 `TIME_UP` 자동 발행
  - `getTimerSpec()`이 상태→제한시간 매핑의 단일 원본 (`TIMER_CONFIG` + 방 옵션, 하드코딩 없음)
  - **페이즈 키가 바뀔 때만 재시작** — 투표 등록·skip 집계는 타이머 유지, 개인 발언은 발언자 교체마다 새 타이머
  - 클라이언트 동기화 인터페이스: `SOCKET_EVENTS.timerSync` + `TimerSyncPayload`(shared/src/socket/events.ts) — `onTimerSync` 콜백으로 브로드캐스트 연결 지점만 마련 (UI·룸 연동은 이후 세션)
- FSM 확장 (requirements 1번 Skip 규칙·7번 발언 순서):
  - **낮 개인 발언 단계**(`day.personalSpeech`) 신설 — 방 옵션(80/120초)씩 순서대로, 조언자 마지막·역/정순 방향(`computeSpeechOrder`)
  - `SKIP` 이벤트에 playerId 부여: 개인 발언/어필/최후의 변론은 **본인만** 즉시 종료, 전체 토론(선출·낮·악 토론)은 **해당 생존자 전원** skip 시 조기 종료
  - **7인 모드 반영** (requirements 1번 확정): 조언자 뽑기 제외 → `setup` 분기로 바로 첫날 낮, 로스터 `ROSTER_BY_MODE[7]`(깡철이·까치선비 제외), `ADVISOR_ELECTION_BY_MODE`
- shared 보강: `RoomTimerSettings`·`DEFAULT_ROOM_TIMER_SETTINGS`(방 옵션 80/120초·3/5분), `ROOM_OPTIONS.playerModes` 7인으로 갱신, 소켓 이벤트 계약(`shared/src/socket/events.ts`)
- 테스트 **53개** 통과 (shared 15 + 서버: logic 21·machine 21·timer 4·session 7 — fake timer로 자동 진행/skip/방 옵션 검증)
- 발견·수정한 버그: `personalSpeech`의 always 안전장치가 매 이벤트 후 재평가되어 마지막 발언자 차례를 건너뛰던 문제 (빈 큐일 때만 동작하도록 수정)

## 이전 세션 상세

### 세션 2 완료: 게임 상태 머신(FSM) 구현 (2026-07-12)

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

### ✅ 환경 이슈 해결: Node 24.11.1(Windows) `vite build` 크래시 (세션 2.5에서 조치)
- 증상: 모듈 transform 직후 exit code `3221226505 (0xC0000409)`로 조용히 사망 — Node 24.11.1 자체 문제로 확정 (Node 22.23.1에서는 정상)
- 조치: **nvm-windows(1.2.2, winget) 설치 + Node 22.23.1 병행 설치·기본 활성화**. 빌드·테스트(32개)·typecheck 모두 Node 22에서 통과 확인
- 주의: nvm이 한글 사용자명 경로(`C:\Users\김한경\AppData\Local\nvm`)를 읽지 못해 루트를 **`C:\nvm4w\nvm`(ASCII)** 로 이전하고 NVM_HOME(User)을 갱신함
  - Machine 스코프 NVM_HOME은 관리자 권한이 없어 구 경로로 남아 있음 (User 값이 우선이라 동작에는 지장 없음 — 거슬리면 관리자 PowerShell에서 갱신)
  - 구 설치 폴더(AppData\Local\nvm)는 언인스톨러가 있어 그대로 둠
- Node 24가 필요하면 `nvm use 24.11.1`로 전환 (기존 시스템 Node 24.11.1은 nvm 관리 하에 보존됨)

### 미결/주의 사항
- ~~6인 모드 로스터~~ → **7인 모드로 확정** (세션 3에서 반영: 깡철이·까치선비 제외, 조언자 선출 없음)
- 레거시 폴더(`frontreact/`, 루트 `src/`·`public/`, `back/`) 정리 여부 미정

## 이전 세션

### 세션 1 완료: 캐릭터/스킬 데이터 모델 확정 (2026-07-12)
- `characterModel.ts` 타입 전용 재설계 (EVIL/GOOD/NEUTRAL, 사용 횟수·시점·패시브·포기 가능 필드, 특수 규칙 필드), 인스턴스 데이터 `config/characters.ts` 분리, 모드별 로스터 `config/roster.ts` 신설
- requirements.md "악 진영 스킬 사용 결정" 15초 → 10초 확정 반영, 데이터 정합성 테스트 14개

### 세션 0 완료: 프로젝트 세팅 (2026-07-12)
- npm workspaces 모노레포(client/server/shared), 기술 스택 세팅, CLAUDE.md, docs/requirements.md 배치
- 게임 규칙 상수 `gameConfig.ts` 분리, 서버는 Socket.io 연결 스켈레톤만 존재

## 다음 세션 할 일 (세션 4)

- **방(룸)·Socket.io 연동**: 방 생성/입장 → `GameSession` 인스턴스 관리 → 소켓 이벤트를 머신 이벤트로 변환
  - `SOCKET_EVENTS.timerSync` 브로드캐스트를 실제 io.emit에 연결
  - 진영·역할별 정보 은닉(해태 투사 결과는 본인에게만, 악 채팅 격리 등) 설계
- 또는 requirements 10번 5단계: **투표/스킬 선택 공용 UI** (client) — 레이아웃 동일, 버튼 텍스트만 분기, 기권·스킬 포기 옵션
- 이후: 6단계 투표 결과 판정 연결 → 7단계 승리 조건(투항 30초 팀 동의·P버튼 포함)
