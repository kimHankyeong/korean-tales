/**
 * 정사각형 크롭 모달 — requirements 11번:
 * "업로드 전 클라이언트에서 정사각형 크롭 UI 제공 → 256×256 리사이즈 후 전송"
 * 드래그로 위치, 슬라이더로 확대를 조절하고, 확정 시 canvas로 256×256 Blob을 만든다.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { computeCropRect, cropToBlob } from '../lib/avatarUpload';

const VIEWPORT = 256; // 미리보기 뷰포트(px) — 업로드 크기와 동일

export interface AvatarCropModalProps {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export function AvatarCropModal({ file, onCancel, onConfirm }: AvatarCropModalProps) {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const imageRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragStart = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const rect = natural ? computeCropRect(natural.w, natural.h, zoom, pan.x, pan.y) : null;
  // 뷰포트 표시용 역변환: 크롭 영역이 뷰포트에 꽉 차도록 이미지를 배치
  const scale = natural && rect ? VIEWPORT / rect.sSize : 1;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !natural || !rect) return;
    // 드래그 픽셀 → pan(-1..1) 변환: 이동 가능 범위(natural - sSize)에 비례
    const rangeX = (natural.w - rect.sSize) * scale;
    const rangeY = (natural.h - rect.sSize) * scale;
    const deltaX = rangeX > 0 ? ((dragStart.current.pointerX - e.clientX) / rangeX) * 2 : 0;
    const deltaY = rangeY > 0 ? ((dragStart.current.pointerY - e.clientY) / rangeY) * 2 : 0;
    setPan({
      x: Math.min(1, Math.max(-1, dragStart.current.panX + deltaX)),
      y: Math.min(1, Math.max(-1, dragStart.current.panY + deltaY)),
    });
  }

  async function confirm() {
    const image = imageRef.current;
    if (!image || !rect) return;
    setBusy(true);
    try {
      onConfirm(await cropToBlob(image, rect));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="dialog" aria-label="프로필 사진 자르기">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-600 bg-slate-900 p-4">
        <h2 className="text-sm font-bold text-slate-100">프로필 사진 자르기</h2>

        {/* 정사각형 크롭 뷰포트 — 드래그로 이동 */}
        <div
          className="relative touch-none overflow-hidden rounded-lg border border-slate-500 bg-slate-800"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragStart.current = null)}
        >
          <img
            ref={imageRef}
            src={objectUrl}
            alt="크롭 미리보기"
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="pointer-events-none absolute max-w-none select-none"
            style={
              natural && rect
                ? {
                    width: natural.w * scale,
                    height: natural.h * scale,
                    left: -rect.sx * scale,
                    top: -rect.sy * scale,
                  }
                : { opacity: 0 }
            }
          />
        </div>

        {/* 확대 슬라이더 */}
        <label className="flex w-full items-center gap-2 text-xs text-slate-300">
          확대
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
            aria-label="확대 배율"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!natural || busy}
            onClick={() => void confirm()}
            className="rounded-lg bg-amber-600 px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            사용하기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-500 px-5 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
