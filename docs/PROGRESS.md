# 진행 기록 (PROGRESS)

## 세션 11 완료: 마이페이지 + 프로필 사진 업로드 (2026-07-16)

- **서버** (requirements 11번 마이페이지):
  - `PATCH /profile/nickname` — 가입과 같은 규칙(2~12자·중복 불가)으로 닉네임 변경
  - `POST /profile/avatar` — raw 이미지 바디 업로드. **서버측 재검증**: Content-Type이 아닌 파일 시그니처(매직 바이트)로 jpg/png/webp 판별, 2MB 초과 413, 위조 바이트 400
  - 저장: `UPLOADS_DIR/avatars/<userId>.<ext>` (형식 변경 시 이전 확장자 정리) + `GET /uploads/avatars/:file` 정적 서빙(경로 조작 차단, 캐시 헤더) — 저장·서빙이 profile/routes.ts에 격리되어 추후 S3류 이관 용이
  - `UPLOADS_DIR` 환경변수 분리 — Render는 영구 디스크 하위 `/data/uploads` (render.yaml·.env.example 갱신)
- **아바타 전파**: 소켓 신원(USER)의 profileImageUrl → Room(RoomPlayer.avatarUrl) → `RoomPlayerInfo`·`PublicPlayerState.avatarUrl` (shared 계약 확장) — 로비·게임 공개 상태에 포함
- **클라이언트**:
  - `MyPage` — 현재 프로필 사진·닉네임 표시/변경, `<input type="file" accept="image/*">`(모바일 갤러리), 클라측 형식·용량 검증(`validateAvatarFile`)
  - `AvatarCropModal` — 정사각형 크롭 UI(드래그 이동 + 확대 슬라이더) → canvas로 **256×256** webp 변환(`computeCropRect`·`cropToBlob` 순수 함수 분리)
  - `Avatar` 공용 컴포넌트 — 사진 없으면 기본 아바타(이니셜). **플레이어 목록 패널(신설)·투표/스킬 선택창·채팅 발신자 표시가 계정 프로필 사진 사용**
  - `lib/api.ts` — credentials 포함 REST 클라이언트(fetchMe/updateNickname/uploadAvatar, 상대 URL 해석)
  - 데모 App: 마이페이지 토글(목 저장 — 소켓 연동 시 lib/api로 교체), 플레이어 목록 패널 장착
- 검증: 테스트 **176개**(shared 14·server 129·client 33) 통과, typecheck·빌드 성공
- 참고: jsdom에 URL.createObjectURL이 없어 MyPage 테스트는 파일 수준 폴리필 사용

### 세션 11 미결/후속
- 실서버 연동 화면에서 MyPage를 lib/api에 배선 (현재 데모는 목 저장)
- 게임 중 프로필 변경은 다음 방 입장부터 반영 (소켓 신원은 핸드셰이크 시점 고정)
- (추후) 부적절 이미지 신고 기능 — 정식 서비스 전 필요 (11번 명기)

## 세션 9 완료: Render 배포 설정 정리 (2026-07-15)

- **render.yaml 보완**: `CLIENT_ORIGIN`(CORS 제한)·`COOKIE_SECRET`(generateValue 자동 생성) 환경변수 추가, 디스크/무료 플랜 주의사항·README 참조 주석 정리
- **서버 배포 설정 배선**: CORS 오리진을 `CLIENT_ORIGIN` 환경변수로 제한 가능(`corsOrigin()` — REST·Socket.io 공용), `COOKIE_SECRET`으로 쿠키 서명(선택)
- **환경변수 예시**: `server/.env.example` 확장(DB 경로·CORS·쿠키 시크릿·REQUIRE_AUTH), `client/.env.example` 신설(`VITE_SERVER_URL`)
- **README.md 재작성** (CRA 잔재 제거): 프로젝트 소개·로컬 개발 절차 + **Render 배포 절차** — GitHub 연결 → 블루프린트 배포 → 영구 디스크 마운트 확인(Shell에서 /data 확인), 무료 플랜 디스크 미지원·콜드스타트 주의사항
- **콜드스타트 안내 UI** (`client/src/components/ServerWakeNotice.tsx`): 로비 진입 시 `/health` 핑 → 1.5초 내 응답 없으면 "서버를 깨우는 중입니다… 최대 1분" 배너(스피너), 3초 간격 재시도, 90초 초과 시 연결 실패 안내. 깨어나면 자동 제거. 데모 App에 장착, 테스트 3개(fetch 목 주입)
- 검증: 테스트 **157개**(shared 14·server 121·client 22) 통과, typecheck·빌드 성공
- 참고: AnimatePresence exit 애니메이션이 fake timer 테스트에서 요소 제거를 지연시켜 배너는 조건부 렌더(즉시 제거)로 구현

## 세션 8 완료: 계정 시스템 (2026-07-15)

- **DB**: Prisma 6 + SQLite (requirements 11번 — PostgreSQL 전환 가능 구조, SQLite 전용 기능 미사용)
  - `server/prisma/schema.prisma`: `User`(이메일·argon2 해시·닉네임 unique·프로필 URL·가입일) + `Session`(불투명 토큰, 30일 만료, cascade)
  - **SQLite 경로는 `DATABASE_URL` 환경변수로 분리** — 로컬 `file:./dev.db`, Render `file:/data/korean_tales.db` (`server/.env.example`)
  - 참고: Prisma 7은 드라이버 어댑터 필수라 v6으로 고정. `--force-reset`은 Prisma의 AI 가드에 걸리므로 테스트는 새 임시 파일 + 일반 `db push` 사용
- **REST 인증** (Fastify — `server/src/app.ts`·`auth/routes.ts`): `POST /auth/signup`(가입 즉시 로그인)·`/auth/login`·`/auth/logout`·`GET /auth/me`
  - httpOnly 세션 쿠키(`kt_session`, SameSite=Lax, prod에서 Secure), 계정 존재 여부를 응답으로 구분 불가하게 처리, `/health`(Render 헬스체크)
- **Socket.io 핸드셰이크 인증** (`auth/socketAuth.ts`): REST와 같은 세션 쿠키 검증 → `socket.data.identity`(판별 유니온 `USER | GUEST`)
  - **로그인 유저는 계정 닉네임이 게임 내 표시 이름으로 강제** (클라이언트가 보낸 name 무시), Room에 `accountId` 연결(추후 전적용)
  - **게스트 분기 구조**: 허용 여부 미정(9번) — 현재 기본 허용, `REQUIRE_AUTH=true`면 미인증 연결 거부 (분기 지점은 socketAuth 한 곳)
- **배포**: `render.yaml` 블루프린트 초안 (웹 서비스 + 영구 디스크 /data 1GB) — ⚠️ **Render 무료 플랜은 영구 디스크 미지원**(디스크 쓰려면 starter 이상, 주석 명기). `start:deploy`(db push 후 기동)·`NODE_VERSION=22.23.1` 고정
- 검증: 서버 테스트 **121개**(auth 서비스/REST 8 + 핸드셰이크 통합 3 신규 — 실제 임시 SQLite로 검증), 전체 **154개** 통과, 서버 기동 + `/health` 200 스모크 확인

### 세션 8 미결/후속
- 마이페이지(닉네임 변경·프로필 사진 업로드 256×256, 11번 후반) 미구현
- 게스트 허용 여부(9번) 확정 필요 — 현재 허용
- Render 무료 플랜 배포 시 디스크 없음 → 계정 데이터 휘발 (starter 전환 또는 감수 결정 필요)

## 세션 7 완료: 승리 판정·게임 종료 플로우 (2026-07-14)

- **승리 조건 체크 경로 확인·보강** (requirements 8번 — 일차 제한 없음):
  - 매 사망 처리 후: `resolveDeaths` 큐 소진 시 `checkWin` (세션 2 구현) — **유서 연쇄로 마지막 악이 죽는 경우**도 즉시 종료됨을 머신 테스트로 검증
  - 투항 완료 시: Room 30초 팀 동의 → `TEAM_SURRENDER` → 상대 진영 승리 (세션 5 구현) — 머신 레벨 테스트 추가
- **개인별 승패 귀속** — `buildGameResult(players, winner)` (`publicState.ts`), `GameOverPayload.roles`에 `alive`·`isWinner` 추가:
  - 승리 진영 소속은 사망해도 승자
  - **중립은 생존 시 승리 팀에 합류** — 선 승리 시는 8번 섹션 확정, ⚠️ **악 승리 시 합류·사망 중립의 비승자 처리는 문서 미확정(동일 규칙 가정, 코드 주석 표기)**
- **게임 종료 화면** (`client/src/components/GameOverScreen.tsx`): 승리 진영 배너(진영 색), 전체 플레이어 캐릭터 공개 그리드(번호·이름·캐릭터·진영·사망 표기·승리 뱃지, stagger 애니메이션), **다시하기/로비로** 버튼(콜백 — 소켓 연동 시 room:start/로비 전환에 배선). 데모 App에서 목 결과로 확인 가능
- 검증: 테스트 **143개**(shared 14·server 110·client 19) 통과, typecheck·프로덕션 빌드 성공

## 세션 6 완료: 클라이언트 핵심 공용 UI (2026-07-14)

- `client/src/components/` — 서버 목(mock) 데이터로 독립 동작하는 공용 UI 3종 (requirements 6번)
  - **ChatWindow**: 낮/밤 표시(`PhaseBadge` — 해/달 아이콘이 화면 중앙에 등장했다가 framer-motion layoutId FLIP으로 "낮" 텍스트 옆에 고정), 카운트다운 문구(`CountdownText` — `토론 시간 00초 남음`, timer:sync의 serverNow 시계 보정), 발언 순서 시스템 메시지(`(해)낮-80초-1번` — `lib/format.ts`)
  - **최후의 변론 모드**: `condemnedId` prop — 처형 확정자만 입력 가능, 나머지는 입력창 비활성화 + 안내 플레이스홀더
  - **SelectionPanel** (투표/스킬 공용): 화면 중앙 1/6 높이, 생존자 번호+프로필 가로 나열(사망자 제외), 프로필 클릭 → 하단 버튼 활성화. props 분기 — `buttonLabel`("투표하기"/"선택하기"), `allowAbstain`(기권 타일), `allowForgo`("스킬 포기" 버튼), `disabledIds`(본인 제외 등)
- `store/gameStore.ts` — Zustand 목 스토어 (소켓 연동 시 SOCKET_EVENTS 핸들러가 액션을 호출하는 구조로 확장 예정)
- `App.tsx` — 데모 플레이그라운드: 페이즈 전환·타이머 시작·발언자 공지·3종 패널 열기·변론 모드 토글을 버튼으로 확인 가능 (`npm run dev:client`)
- client 테스트 환경 구축 (jsdom + @testing-library/react) — 컴포넌트 테스트 14개
- 전체 검증: 테스트 **133개**(shared 14·server 105·client 14) 통과, typecheck·프로덕션 빌드(Node 22) 성공
- 참고: jsdom에 `scrollTo`가 없어 채팅 자동 스크롤은 `scrollTop` 대입으로 구현

## 세션 5 완료: Socket.io 실시간 레이어 + 방(로비) 시스템 (2026-07-14)

- **이벤트 계약** (`shared/src/socket/events.ts` 확장 + `shared/src/game/gameEvents.ts` 신설 — 머신 이벤트를 client/server 공용 단일 원본으로 이관)
- **방 시스템** (`server/src/rooms/`): 생성(6자리 코드)·입장·퇴장(방장 승계·빈 방 폐기)·설정 변경(방장 전용, `ROOM_OPTIONS` 값만 허용 — 7인/9인·80/120초·3/5분)
- **진영 선호 선택**: 로비에서 선택, 배정은 무작위 기반(`assignCharacters` — 선호는 우선 고려일 뿐 보장 아님, 선호자 처리 순서도 무작위). 선호는 다른 플레이어에게 비공개
- **게임 시작**: 캐릭터 무작위 배정 → `gameRole`을 **본인 소켓에만** 전송, GameSession 연결(타이머 동기화·상태 브로드캐스트)
- **정보 은닉** (스코프는 전부 Room에서 결정, `toPublicGameState`가 단일 관문):
  - 공개 `gameState`에는 캐릭터/진영/밤 행동/투사 결과 미포함 (테스트로 직렬화 검사)
  - 해태 투사 결과는 해태 본인에게만 (`gameInvestigation`)
  - 악 진영 채널(`chat` EVIL)은 밤에 악 생존자에게만 중계
  - 투항 진행 상황은 같은 팀에게만 — 상대 팀 비노출
  - 역할 전체 공개는 게임 종료(`gameOver`) 페이로드에서만
- **투항(30초 팀 동의)** 구현: Room이 동의 집계(PhaseTimer 30초) → 전원 동의 시 머신에 `TEAM_SURRENDER` → 상대 진영 승리. 시간 초과 시 취소·게임 계속
- **액션 권한 검증** (`actionAuth.ts`): 명의 도용 차단(투표/스킵), 캐릭터 전용 스킬 본인 확인, 사망 트리거 응답은 대기 당사자만, 서버 전용 이벤트(TIME_UP 등) 거부
- 테스트 **120개** 통과 (shared 15 + 서버 105 — 실제 Socket.io 왕복 통합 테스트 2건 포함: 7인 방 풀 사이클, 액션 권한)
- 미구현: 게임 중 재접속(소켓 id=플레이어 id 임시), P버튼, 발언권 세부 채팅 제한(변론 중 등)

## 세션 4 완료: 투표·스킬 판정 로직 (2026-07-13)

- **동표 2라운드 공통 규칙**을 순수 함수로 추출 (`resolveTieBreak`) — 처형 투표(5-4항)와 조언자 선출(7번)이 동일 로직을 재사용
  - `resolveExecutionVote(votes, round, tieCandidates)`: 전원 기권 → 무처형(밤 전환) / 1표라도 있으면 최다득표 처형 / 1차 동표 → 20초 동시발언(TIE_SPEECH) → 재투표 / 재동표 → 무작위(EXECUTE_RANDOM)
  - `resolveElectionVote(votes, round, pools)`: 단독 최다 → 확정 / 1차 동표 → 재투표(REVOTE) / 재동표·무득표 → 무작위. `canVoteInElection`으로 출마자 투표권 제외
  - 무작위 추첨은 결과에 pool만 담아 반환 — rng 실행은 머신 액션에서만 (guard 순수성 유지)
- **스킬 상호작용 판정 순수 함수** (우선순위 주석 명시):
  - `resolveNightKillOutcome` — 도깨비 장난 밤이면 킬 무효, 공지는 킬 없음과 동일한 "사망자 없음"(차단 비공개 보장)
  - `isRevivableTonight` — 부활꽃은 그날 밤 악 킬 사망자만 (동반사망자·처형자·유서 사망자 제외를 cause로 판별)
  - `compassionApplies` — 연민은 까치선비(부활 수혜자) 한정, 사망 원인 불문(멸망꽃 포함)
  - `isTakeAlongSealed` — 멸망꽃 사망 → 동귀어진류(피 맺힌 유서) 봉인
  - 부활자의 사용한 1회성 스킬 소모 유지는 skillUses를 절대 초기화하지 않는 것으로 보장
- machine.ts를 위 판정 함수 기반으로 재배선 (선출/처형 재투표 전이 단순화 — 단일 전이로 수렴)
- 테스트 **87개** 통과 (shared 15 + 서버 72: logic 36·machine 25·session 7·timer 4)
  - 복합 케이스 포함: "장난이 있던 밤 킬은 무산 + 그 밤 지정한 길동무는 저승사자 낮 처형 시 그대로 동반 사망", 멸망꽃 유서 봉인, 멸망꽃 사망 까치선비의 연민 부활, 부활한 도깨비의 장난 소모 유지

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

## 다음 세션 할 일 (세션 8)

- **소켓 연동 실화면**: 로비 화면(방 생성/입장·설정·진영 선호) + 게임 화면 조립
  - socket.io-client 연결 훅 — `SOCKET_EVENTS` 수신을 gameStore 액션에 배선 (목 → 실데이터 교체)
  - 서버 `PublicGameState`/`timerSync`를 ChatWindow·SelectionPanel에 연결, `gameAction` 발신
  - `game:over` 수신 → GameOverScreen 표시, 다시하기(room:start 재요청)/로비로 배선
- 이후: 6번 섹션 부속 UI(메모장·스킬북 모달·플레이어 목록 패널·투항 버튼·P버튼 — P버튼은 머신 이벤트 추가 필요) → 9인 풀 시뮬레이션 테스트(10번 9단계)
- ⚠️ 확인 필요: 악 승리 시 생존 중립의 승리 합류 여부, 사망 중립의 귀속 (현재 "생존 시 승리 팀 합류"로 가정 — requirements 8번에 확정 시 반영)
