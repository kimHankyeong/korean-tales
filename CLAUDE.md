# korean_tales

한국 설화 기반 **채팅형 소셜 디덕션(마피아류) 게임**. 6인/9인 방에서 저승사자·구미호 등 악 진영과 해태·자청비 등 선 진영이 낮(토론·투표)/밤(스킬·킬) 사이클을 반복하며, 진영 전멸 또는 팀 전원 투항으로 승패가 갈린다. 첫날 아침 "조언자" 선출로 발언 순서를 정하는 것이 특징. 모든 타이머는 서버 권위(server-authoritative)로 동작한다.

## 게임 규칙의 유일한 출처

**게임 규칙의 유일한 출처는 `docs/requirements.md`이며, 규칙 관련 구현 시 반드시 이 문서를 참조할 것.**
규칙이 코드와 문서 간에 충돌하면 문서가 우선이다. 규칙 변경은 문서를 먼저 고친 뒤 코드에 반영한다.

## 기술 스택

| 영역 | 스택 |
|---|---|
| client | React + TypeScript + Vite, Zustand(상태), Tailwind CSS v4(스타일), Framer Motion(애니메이션), socket.io-client |
| server | Node.js + TypeScript, Fastify(REST 인증), Socket.io(실시간), XState(게임 상태 머신), tsx(실행) |
| DB/인증 | SQLite + Prisma (경로는 `DATABASE_URL`), argon2 해시, httpOnly 세션 쿠키 — REST와 소켓 핸드셰이크가 세션 공유 |
| shared | client·server 공유 타입/상수 (캐릭터·스킬 모델, 게임 규칙 config, 소켓 이벤트 계약) |
| 테스트 | Vitest |
| 배포 | Render (render.yaml 블루프린트 — 영구 디스크는 유료 플랜부터, 주석 참고) |

## 폴더 구조 (npm workspaces 모노레포)

```
korean_tale/
├─ client/            # React 클라이언트 (@korean-tales/client)
├─ server/            # Socket.io 게임 서버 (@korean-tales/server)
├─ shared/            # 공유 타입·상수 (@korean-tales/shared)
│  └─ src/
│     ├─ characters/characterModel.ts  # 캐릭터/스킬 데이터 모델 (여기가 원본)
│     └─ config/gameConfig.ts          # 타이머·방 옵션 등 규칙 상수
├─ docs/
│  ├─ requirements.md # ★ 게임 규칙의 유일한 출처
│  └─ PROGRESS.md     # 세션별 진행 기록
└─ tsconfig.base.json # 공통 strict TS 설정
```

주요 명령 (루트에서 실행):
- `npm run dev:client` / `npm run dev:server` — 개발 서버
- `npm run typecheck` / `npm run test` / `npm run build` — 전체 워크스페이스 대상
- `npm run db:generate` / `npm run db:push` (server 워크스페이스) — Prisma 클라이언트 생성·스키마 반영.
  서버 코드 수정 전 최초 1회 `db:generate` 필요. 로컬 DB는 `server/dev.db` (gitignore됨, `server/.env.example` 참고)

⚠️ **Node 버전**: 이 프로젝트의 `vite build`는 Windows의 Node 24.11.1에서 크래시한다
(0xC0000409, 상세는 docs/PROGRESS.md 참고). **빌드는 Node 22 LTS로 실행할 것.**
dev 서버·vitest·typecheck는 Node 24에서도 정상 동작한다.
- 이 PC에는 nvm-windows가 설치되어 있고 기본 활성 버전이 **22.23.1**이다 (`nvm use 22.23.1` / `nvm use 24.11.1`로 전환).
- nvm 루트는 `C:\nvm4w\nvm` — 한글 사용자명 경로를 nvm이 처리하지 못해 ASCII 경로로 이전했음. NVM_HOME(User)도 이 경로를 가리킨다.

## 코드 컨벤션

- **TypeScript strict 모드** (`tsconfig.base.json`에서 강제, `noUncheckedIndexedAccess` 포함). 새 워크스페이스는 반드시 base를 extends 할 것.
- **게임 규칙 상수 하드코딩 금지** — 타이머 초, 인원수, 발언시간 등 규칙 숫자는 `shared/src/config/gameConfig.ts`에 정의하고 import해서 사용한다. 각 상수에는 requirements.md의 섹션 번호를 주석으로 남긴다.
- 캐릭터/스킬 관련 타입·데이터는 `shared/src/characters/characterModel.ts`가 단일 원본. client/server에서 복제하지 말 것.
- shared는 소스(.ts)를 직접 export하는 패키지다(`@korean-tales/shared`) — 별도 빌드 단계 없음.

## 레거시 (참고용, 신규 코드 작성 금지)

- `frontreact/` — 초기 UI 프로토타입(Vite + JS). 일러스트 에셋과 로비 UI 참고용.
- `src/`, `public/` — 초기 CRA 잔재. 루트 package.json이 워크스페이스 루트로 전환되면서 더 이상 실행되지 않음.
- `back/` — 빈 폴더 (미사용).
