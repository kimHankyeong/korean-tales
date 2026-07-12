import { CHARACTERS, FACTION_META } from '@korean-tales/shared';

/**
 * 스캐폴드 확인용 화면 — 게임 UI는 이후 세션에서 docs/requirements.md 6번 섹션 기반으로 구현.
 * shared 패키지 연동이 동작하는지 캐릭터 데이터로 확인한다.
 */
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <h1 className="text-4xl font-bold">korean_tales</h1>
      <p className="text-slate-400">한국 설화 기반 채팅형 소셜 디덕션 게임</p>
      <ul className="flex flex-wrap justify-center gap-2 px-8">
        {CHARACTERS.map((c) => (
          <li key={c.id} className="rounded-full border border-slate-700 px-3 py-1 text-sm">
            {c.name} · {FACTION_META[c.faction].label}
          </li>
        ))}
      </ul>
    </main>
  );
}
