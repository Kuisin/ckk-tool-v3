"use client";

/**
 * FloorMapCanvas — フロアマップ + ピンの共有キャンバス。
 *
 * 拠点フロアマップ（kiosk_floor_maps — 端末管理と保管場所で共用）の図面上に
 * %座標のピンを表示し、editable ではポインタードラッグで移動できる
 * （SY09 KioskFloorMapView と同じ Pointer Events 方式・外部ライブラリなし）。
 * 利用側: MS0C 保管場所タブ（配置編集）/ 在庫管理 PD04 ロケーション（閲覧）。
 */

import { Box, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export interface FloorMapPin {
  id: string;
  /** %座標。 */
  x: number;
  y: number;
  /** ツールチップ。 */
  label: string;
  /** ピンの描画（アイコン）。 */
  icon: ReactNode;
  selected?: boolean;
  /** false = ドラッグ対象外（editable でも固定表示）。 */
  draggable?: boolean;
}

export function FloorMapCanvas({
  imageUrl,
  imageAlt,
  pins,
  editable = false,
  onMove,
  onSelect,
  onBackgroundClick,
  overlays = [],
  overlayOpacity = 0.35,
}: {
  /** 図面画像 URL（null = 方眼プレースホルダ）。 */
  imageUrl: string | null;
  imageAlt: string;
  pins: FloorMapPin[];
  /** true = draggable ピンをドラッグで移動可能。 */
  editable?: boolean;
  /** ドラッグ確定時（%座標）。 */
  onMove?: (id: string, x: number, y: number) => void;
  /** ピンクリック（editable 中は発火しない）。 */
  onSelect?: (id: string) => void;
  onBackgroundClick?: () => void;
  /**
   * 重ね表示する他フロアの図面（低不透明度で上に敷く — 複数フロアの図面の
   * 位置合わせ用。%座標系は共有なのでベース画像と同じ枠に引き伸ばす）。
   */
  overlays?: { id: string; url: string }[];
  overlayOpacity?: number;
}) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  // ドラッグ中のローカル座標（保存完了までの表示上書き）
  const [localPos, setLocalPos] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const pctFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    return {
      x: clampPct(((e.clientX - rect.left) / rect.width) * 100),
      y: clampPct(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const onPinPointerDown = (pin: FloorMapPin, e: React.PointerEvent) => {
    if (!editable || pin.draggable === false) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id: pin.id, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPinPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    setLocalPos((prev) => ({ ...prev, [drag.id]: pctFromEvent(e) }));
  };

  const onPinPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.moved) return;
    const pos = pctFromEvent(e);
    setLocalPos((prev) => {
      const next = { ...prev };
      delete next[drag.id];
      return next;
    });
    onMove?.(drag.id, pos.x, pos.y);
  };

  return (
    <Box
      onClick={() => {
        if (!editable) onBackgroundClick?.();
      }}
      ref={areaRef}
      style={{
        position: "relative",
        width: "100%",
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {imageUrl ? (
        // biome-ignore lint/performance/noImgElement: SeaweedFS プロキシ配信の等倍図面（next/image 最適化対象外）
        <img
          alt={imageAlt}
          draggable={false}
          src={imageUrl}
          style={{ width: "100%", display: "block" }}
        />
      ) : (
        <Box
          style={{
            aspectRatio: "4 / 3",
            backgroundColor: "var(--mantine-color-body)",
            backgroundImage:
              "linear-gradient(var(--mantine-color-default-border) 1px, transparent 1px)," +
              "linear-gradient(90deg, var(--mantine-color-default-border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      )}
      {overlays.map((o) => (
        // biome-ignore lint/performance/noImgElement: SeaweedFS プロキシ配信の等倍図面（next/image 最適化対象外）
        <img
          alt=""
          aria-hidden
          draggable={false}
          key={o.id}
          src={o.url}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill", // %座標系を共有するためベース枠に合わせる
            opacity: overlayOpacity,
            pointerEvents: "none",
          }}
        />
      ))}
      {pins.map((pin) => {
        const pos = localPos[pin.id] ?? { x: pin.x, y: pin.y };
        const canDrag = editable && pin.draggable !== false;
        return (
          <Tooltip
            events={{ hover: true, focus: true, touch: true }}
            key={pin.id}
            label={pin.label}
            withinPortal
          >
            <Box
              onClick={(e) => {
                if (editable) return;
                e.stopPropagation();
                onSelect?.(pin.id);
              }}
              onPointerDown={(e) => onPinPointerDown(pin, e)}
              onPointerMove={onPinPointerMove}
              onPointerUp={onPinPointerUp}
              style={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: pin.selected
                  ? "translate(-50%, -50%) scale(1.25)"
                  : "translate(-50%, -50%)",
                cursor: canDrag ? "grab" : "pointer",
                touchAction: "none",
                lineHeight: 0,
                zIndex: pin.selected ? 3 : 2,
                padding: 8, // タッチ用ヒット領域
              }}
            >
              {pin.icon}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
