/**
 * 캐릭터 일러스트 매핑 — shared CharacterId 기준.
 * 스킬북(직업 설명)·게임 화면의 캐릭터 표시가 공용으로 사용한다.
 * ⚠️ 깡철이 일러스트는 아직 없음(null) — 추가되면 여기만 채우면 된다.
 */

import type { CharacterId } from '@korean-tales/shared';
import baridegi from '../assets/illustrations/baridegi.png';
import dokkaebi from '../assets/illustrations/dokkaebi.jpg';
import gumiho from '../assets/illustrations/gumiho.png';
import haetae from '../assets/illustrations/haetae.jpg';
import jacheongbi from '../assets/illustrations/jacheongbi.png';
import janghwa from '../assets/illustrations/janghwa.png';
import jeoseung from '../assets/illustrations/jeoseung.png';
import kkachi from '../assets/illustrations/kkachi.png';

export const CHARACTER_IMAGES: Record<CharacterId, string | null> = {
  jeoseung,
  kkangcheol: null, // 일러스트 미제작 — 준비되면 교체
  gumiho,
  jacheongbi,
  haetae,
  dokkaebi,
  janghwa,
  baridegi,
  kkachi,
};
