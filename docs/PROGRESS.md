# 진행 기록 (PROGRESS)

## 세션 0 완료: 프로젝트 세팅 (2026-07-12)

- npm workspaces 모노레포 구조 세팅: `client/`(React+TS+Vite, Zustand, Tailwind v4, Framer Motion, socket.io-client) · `server/`(Node+TS, Socket.io, XState, tsx) · `shared/`(공유 타입·상수)
- 확정 요구사항 문서를 `docs/requirements.md`로 배치 — 게임 규칙의 유일한 출처로 지정
- 캐릭터/스킬 데이터 모델을 `shared/src/characters/characterModel.ts`로 이관하고 확정 문서 반영 (해태 "투사" 결과 문구 "악 진영입니다/아닙니다", 깡철이 "재앙무죄", 장화홍련 "피 맺힌 유서", 까치선비 "까치의 보은" 등)
- 게임 규칙 상수를 `shared/src/config/gameConfig.ts`로 분리 (타이머 표·방 옵션, requirements 1·2번 섹션)
- 루트 `CLAUDE.md` 작성 (프로젝트 요약, 스택/구조, 규칙 출처 원칙, 코드 컨벤션)
- 검증: `npm run typecheck` 전체 통과, Vitest 데이터 정합성 테스트 5개 통과, client 프로덕션 빌드 성공
- 게임 로직은 아직 미구현 (서버는 Socket.io 연결 스켈레톤만 존재)

### 미결/주의 사항
- requirements 2번 표의 "악 진영 스킬 사용 결정 15초"와 4번 섹션의 "악 진영 개별 스킬 10초"가 상이 — FSM 구현 시 확정 필요 (`gameConfig.ts` 주석 참고)
- 중립 진영(바리공주) 자체 승리 조건 미정
- 레거시 폴더(`frontreact/`, 루트 `src/`·`public/`, `back/`) 정리 여부 미정

## 다음 세션 할 일 (세션 1)

- 게임 상태 머신(FSM) 설계·구현 — requirements 4번(밤)·5번(낮)·7번(조언자 출마) 섹션 기반, XState로 `server/`에 작성
  - 첫날 아침 조언자 선출 → 낮/밤 사이클 → 사망 확정 트리거(저승사자/장화홍련/조언자/까치선비)까지 상태로 표현
  - 각 상태 전이 조건과 다음 상태를 주석으로 명시
- 이후 순서는 requirements 10번 섹션의 단계별 프롬프트(4단계 타이머 → 5단계 공용 UI → …)를 따른다
