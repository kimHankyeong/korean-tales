import gumihoImg from '../assets/illustrations/gumiho.png';
import jeoseungImg from '../assets/illustrations/jeoseung.png';
import susalgwiImg from '../assets/illustrations/susalgwi.png';
import haetaeImg from '../assets/illustrations/haetae.jpg';
import jacheongbiImg from '../assets/illustrations/jacheongbi.png';
import baridegiImg from '../assets/illustrations/baridegi.png';
import kkachiImg from '../assets/illustrations/kkachi.png';
import dokkaebiImg from '../assets/illustrations/dokkaebi.jpg';
import janghwaImg from '../assets/illustrations/janghwa.png';

export const CHARACTERS = [
  { id: 'gumiho', name: '구미호', faction: 'evil', shape: 'fox', ability: '밤마다 한 사람을 홀려 제거한다.', image: gumihoImg },
  { id: 'jeoseung', name: '저승사자', faction: 'evil', shape: 'scroll', ability: '한 사람을 지목해 다음 날 운명을 정한다.', image: jeoseungImg },
  { id: 'susalgwi', name: '수살귀', faction: 'evil', shape: 'droplet', ability: '한 사람을 물속에 가두어 능력을 봉인한다.', image: susalgwiImg },
  { id: 'haetae', name: '해태', faction: 'good', shape: 'lens', ability: '밤마다 한 사람을 지켜 위협을 막아낸다.', image: haetaeImg },
  { id: 'jacheongbi', name: '자청비', faction: 'good', shape: 'sword-flower', ability: '한 사람의 정체를 몰래 확인한다.', image: jacheongbiImg },
  { id: 'baridegi', name: '바리데기', faction: 'good', shape: 'flower', ability: '죽은 자를 단 한 번 되살릴 수 있다.', image: baridegiImg },
  { id: 'kkachi', name: '까치선비', faction: 'good', shape: 'bird', ability: '낮 토론에서 두 표를 행사할 수 있다.', image: kkachiImg },
  { id: 'dokkaebi', name: '도깨비', faction: 'good', shape: 'club', ability: '한 사람의 투표를 무효로 만든다.', image: dokkaebiImg },
  { id: 'janghwa', name: '장화홍련', faction: 'good', shape: 'rope', ability: '자신이 제거되면 그 상대를 모두에게 알린다.', image: janghwaImg },
];

export const FACTION_META = {
  evil: { label: '악', color: '#b98ee0', bg: '#241a34', border: 'rgba(185,142,224,0.35)' },
  good: { label: '선', color: '#9fd4f5', bg: '#16283a', border: 'rgba(159,212,245,0.35)' },
  neutral: { label: '중립', color: '#f0d878', bg: '#332a12', border: 'rgba(240,216,120,0.4)' },
};

export const ROOM_LIST = [
  { name: '달빛 아래 첫 판', mode: 9, visibility: '공개', players: 6 },
  { name: '초심자 환영', mode: 6, visibility: '공개', players: 3 },
  { name: '고수만 오세요', mode: 9, visibility: '공개', players: 8 },
];

export const MATCH_HISTORY = [
  { result: '승', when: '오늘', mode: 9 },
  { result: '패', when: '2일 전', mode: 6 },
  { result: '승', when: '5일 전', mode: 9 },
];

export function shapeStyle(shape, color, size = 22) {
  const base = { width: size, height: size, background: color, flexShrink: 0 };
  switch (shape) {
    // 구미호 — 여우얼굴
    case 'fox':
      return { ...base, clipPath: 'polygon(50% 100%, 15% 55%, 0% 8%, 30% 32%, 50% 0%, 70% 32%, 100% 8%, 85% 55%)' };
    // 저승사자 — 두루마리
    case 'scroll':
      return { width: size * 0.62, height: size, background: color, flexShrink: 0, borderRadius: '999px / 22%' };
    // 수살귀 — 물방울
    case 'droplet':
      return { width: size, height: size, background: color, flexShrink: 0, borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)' };
    // 해태 — 돋보기 (렌즈)
    case 'lens':
      return { width: size, height: size, borderRadius: '50%', border: `3px solid ${color}`, background: 'transparent', flexShrink: 0 };
    // 자청비 — 칼과 꽃이 교차한 모양
    case 'sword-flower':
      return {
        ...base,
        clipPath: 'polygon(35% 0%,65% 0%,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0% 65%,0% 35%,35% 35%)',
        transform: 'rotate(45deg)',
      };
    // 바리데기 — 꽃
    case 'flower': {
      const d = Math.max(4, Math.round(size * 0.32));
      const r = Math.max(3, Math.round(size * 0.16));
      return {
        width: r * 2,
        height: r * 2,
        background: color,
        borderRadius: '50%',
        flexShrink: 0,
        boxShadow: `${d}px 0 0 0 ${color}, -${d}px 0 0 0 ${color}, 0 ${d}px 0 0 ${color}, 0 -${d}px 0 0 ${color}`,
        margin: d,
      };
    }
    // 까치선비 — 까치(새)
    case 'bird':
      return { ...base, clipPath: 'polygon(50% 30%, 0% 70%, 35% 55%, 50% 100%, 65% 55%, 100% 70%)' };
    // 도깨비 — 방망이
    case 'club':
      return { ...base, clipPath: 'polygon(35% 100%, 40% 40%, 18% 28%, 30% 4%, 70% 4%, 82% 28%, 60% 40%, 65% 100%)' };
    // 장화홍련 — 밧줄
    case 'rope':
      return {
        width: size * 1.5,
        height: size * 0.34,
        background: `repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 3px, transparent 3px 8px), ${color}`,
        borderRadius: 999,
        flexShrink: 0,
        transform: 'rotate(-18deg)',
      };
    default:
      return { ...base, borderRadius: '50%' };
  }
}
