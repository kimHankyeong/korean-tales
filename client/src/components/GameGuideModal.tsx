/**
 * 게임설명 모달 — 로비 메뉴에서 여는 플레이어용 규칙 요약.
 * 세부 수치·예외 규칙의 유일한 출처는 docs/requirements.md(1·4·5·7·8번 섹션)이며,
 * 여기서는 처음 접하는 플레이어가 한눈에 흐름을 파악할 수 있도록 간결하게만 정리한다.
 */

import type { ReactNode } from 'react';
import { CloseButton } from './CloseButton';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-bold text-amber-200">{title}</h3>
      <div className="space-y-1 text-xs leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export function GameGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-black/70 p-4 md:p-8" role="dialog" aria-label="게임설명">
      <div className="relative mx-auto max-w-2xl rounded-2xl border border-slate-600 bg-slate-900 p-4 md:p-6">
        <CloseButton onClick={onClose} />

        <h2 className="mb-4 text-center text-base font-bold text-amber-300">게임설명</h2>

        <div className="space-y-4">
          <Section title="인원과 진영">
            <p>7인 또는 9인 모드로 진행되며, 방장이 방 안에서 인원 모드를 선택합니다.</p>
            <p>악 진영과 선 진영, 그리고 소수의 중립 캐릭터로 나뉘어 각자 배정된 캐릭터의 정체를 숨긴 채 진행합니다.</p>
          </Section>

          <Section title="하루의 흐름">
            <p>9인 모드는 첫날 아침에만 "조언자" 선출(출마 → 개인 발언 → 토론 → 투표)을 진행합니다.</p>
            <p>이후 매일 낮(개인 발언 → 전체 토론 → 처형 투표 → 최후의 변론)과 밤(선 진영·악 진영 각자의 스킬 사용)이 반복됩니다.</p>
            <p>발언 중 Skip 버튼으로 본인 차례를 조기 종료할 수 있고, 전체 토론은 생존자 전원이 Skip하면 조기 종료됩니다.</p>
          </Section>

          <Section title="🪄 조언자 선출이란?">
            <p>1일차 아침에 원하는 사람이 출마하고, 투표로 뽑힌 한 명에게 "지팡이"를 쥐여주는 절차입니다.</p>
            <p>지팡이를 받은 조언자는 자기 번호 앞뒤로 정방향 또는 역방향 중 그날의 발언 순서를 정할 권리가 생깁니다.</p>
            <p>조언자 본인은 항상 가장 마지막 순서로 말하게 되며, 앞사람들의 발언을 정리해줄 수도 있습니다.</p>
          </Section>

          <Section title="7️⃣ 7인 모드에서는">
            <p>깡철이와 까치선비가 빠집니다. 그와 함께 조언자 선출 절차도 진행하지 않습니다.</p>
          </Section>

          <Section title="캐릭터와 스킬">
            <p>우측 상단(또는 로비 메뉴)의 "직업 설명" 버튼에서 9개 캐릭터의 스킬과 진영을 언제든 확인할 수 있습니다.</p>
          </Section>

          <Section title="🕵️‍♂️ 직업 공개">
            <p>해태(경찰직)와 까치선비 외에는 자신의 직업을 스스로 공개하지 않는 걸 권장합니다.</p>
            <p>다만 게임이 막바지에 이르러 마지막 남은 악과 중립을 가려내야 할 때는 직업을 공개해도 좋습니다.</p>
          </Section>

          <Section title="🏆 승리 조건">
            <p>악 진영은 마피아 역할, 중립과 선 진영은 시민 진영에 해당합니다.</p>
            <p>👿 악 진영은 중립을 모두 죽이면 승리합니다. 중립이 살아있는 채로 선 진영을 모두 죽여도 승리하지 않습니다.</p>
            <p>😇 선 진영은 중립을 지켜내면서 악 진영을 모두 제거하면 승리합니다. 중립의 정체는 선 진영도 알지 못합니다.</p>
          </Section>

          <Section title="방 참여">
            <p>로비 메뉴의 "게임 시작"에서 모집 중인 공개방 목록을 보고 입장하거나, 목록 맨 위에서 새 방을 만들 수 있습니다.</p>
            <p>방 안에서 전원이 "준비"를 누르고 정원이 다 차면 자동으로 게임이 시작됩니다.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
