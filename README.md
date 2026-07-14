# korean_tales

한국 설화 기반 **채팅형 소셜 디덕션(마피아류) 게임**. 7인/9인 방에서 저승사자·구미호 등
악 진영과 해태·자청비 등 선 진영이 낮(토론·투표)/밤(스킬·킬) 사이클을 반복한다.
게임 규칙의 유일한 출처는 [docs/requirements.md](docs/requirements.md)이며,
개발 진행 기록은 [docs/PROGRESS.md](docs/PROGRESS.md), 상태 머신 설계는 [docs/fsm.md](docs/fsm.md) 참고.

## 기술 스택

- **client/** — React + TypeScript + Vite, Zustand, Tailwind CSS v4, Framer Motion, socket.io-client
- **server/** — Node.js + TypeScript, Fastify(REST 인증), Socket.io(실시간), XState(게임 상태 머신), Prisma + SQLite
- **shared/** — client·server 공유 타입/상수 (캐릭터·스킬 모델, 게임 규칙 config, 소켓 이벤트 계약)

## 로컬 개발

```bash
npm install
npm run db:generate --workspace @korean-tales/server   # Prisma 클라이언트 생성 (최초 1회)
npm run db:push --workspace @korean-tales/server        # 로컬 SQLite(dev.db) 스키마 반영
npm run dev:server   # 게임 서버 (기본 :4000)
npm run dev:client   # 클라이언트 (Vite)
```

- 검증: `npm run typecheck` / `npm run test` / `npm run build`
- 환경변수: `server/.env.example`, `client/.env.example`을 각각 `.env`로 복사해 사용
- ⚠️ Windows에서 `vite build`는 **Node 22 LTS**로 실행할 것 (Node 24.11.1 크래시 — CLAUDE.md 참고)

## Render 배포 (requirements 12번)

블루프린트 파일 [render.yaml](render.yaml)로 서버를 배포한다. 예상 동시 접속 7~16명
기준의 소규모 운영을 전제로 한다.

### 1. GitHub 연결

1. 이 저장소를 GitHub에 push한다.
2. [Render 대시보드](https://dashboard.render.com) → **New → Blueprint** 선택.
3. GitHub 계정을 연결하고 이 저장소를 선택하면 루트의 `render.yaml`을 자동 인식한다.

### 2. 블루프린트 배포

1. 서비스 이름(`korean-tales-server`)과 플랜을 확인하고 **Apply**.
2. 환경변수 확인:
   - `DATABASE_URL` — SQLite 파일 경로. 영구 디스크 사용 시 `file:/data/korean_tales.db`
   - `CLIENT_ORIGIN` — 클라이언트 배포 도메인 (CORS 제한). 실제 주소로 교체할 것
   - `COOKIE_SECRET` — 블루프린트가 자동 생성 (`generateValue: true`)
3. 빌드가 끝나면 `https://<서비스명>.onrender.com/health` 가 `{"ok":true}`를 반환하는지 확인.

### 3. 영구 디스크 마운트 확인

> ⚠️ **영구 디스크는 무료(free) 플랜에서 지원되지 않는다.**
> free로 배포하려면 `render.yaml`의 `disk` 블록을 제거하고 `DATABASE_URL`을
> `file:./dev.db`로 바꿔야 하며, 이 경우 **재배포/재시작 때마다 계정 데이터가 초기화**된다.
> 계정 데이터를 보존하려면 **starter 플랜 이상**으로 올리고 디스크를 유지할 것.

디스크를 사용하는 경우(starter 이상):

1. 서비스 → **Disks** 탭에서 `korean-tales-data`가 `/data`에 마운트됐는지 확인.
2. 서비스 → **Shell** 탭에서 `ls -la /data` 실행 → 첫 기동 후 `korean_tales.db` 파일이 보이면 정상.
   (`startCommand`의 `prisma db push`가 첫 부팅 때 스키마를 만든다)
3. 재배포 후에도 파일이 유지되는지 한 번 더 확인하면 완료.

### 무료 티어 주의사항

- **콜드스타트**: 15분간 요청이 없으면 서버가 슬립 상태로 전환되고, 다음 접속 시
  깨어나는 데 수십 초가 걸린다. 클라이언트 로비가 "서버를 깨우는 중입니다…" 안내를
  자동 표시한다 (`client/src/components/ServerWakeNotice.tsx`).
- 트래픽이 늘면 Railway Hobby($5/월) 또는 Render 유료 인스턴스(월 $7~) 전환 검토 (12번 섹션).

## 레거시 폴더

`frontreact/`(초기 프로토타입), 루트 `src/`·`public/`(CRA 잔재), `back/`(미사용)은
참고용으로만 남아 있다 — 신규 코드 작성 금지 (CLAUDE.md).
