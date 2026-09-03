"use client";

/**
 * ImageCropModal — 画像を正方形に切り抜くモーダル（依存追加なし・自前実装）。
 *
 * 使い方: ファイル選択 → このモーダルで位置と大きさを決める → onConfirm に
 * 切り抜き済みの File が渡る。アップロードするのは切り抜き後の画像なので、
 * 表示側は「正方形の画像を丸く出す」だけでよい（UserAvatar）。
 *
 * 操作:
 *   - ドラッグ（マウス / タッチ）で位置合わせ
 *   - スライダー or ホイール、タブレットは2本指ピンチで拡大縮小
 *     （= 切り抜く範囲の大きさ）
 *
 * 実装メモ: 切り抜きはブラウザの canvas で行う。表示は 1 辺 VIEW px の
 * 正方形ビューポートで、そこに収まる元画像の領域がそのまま切り抜き範囲。
 * scale=1 が「短辺がぴったり収まる」状態で、拡大するほど狭い範囲を切り取る。
 *
 * 出力は **大小 2 枚**（同じ切り抜き範囲を別解像度で書き出す）:
 *   大 = 最大 OUTPUT_MAX px（元がそれ未満なら拡大はしない）
 *   小 = THUMB_PX px — 一覧・ヘッダー・履歴で読む用
 * 元画像はここで 1 回だけデコード済みなので、2 枚目の書き出しはほぼ無料。
 */

import { Box, Group, Modal, Slider, Stack, Text } from "@mantine/core";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CancelButton, GhostButton, PrimaryButton } from "./buttons";

/** ビューポート（切り抜き枠）の 1 辺 px。 */
const VIEW = 288;
/** 出力する正方形の最大 1 辺 px（大サイズ）。 */
const OUTPUT_MAX = 512;
/** 一覧・ヘッダー・履歴用のサムネイルの 1 辺 px（小サイズ）。 */
const THUMB_PX = 96;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Offset {
  x: number;
  y: number;
}

export interface CroppedImages {
  /** 大サイズ（最大 OUTPUT_MAX px 四方）。 */
  full: File;
  /** 小サイズ（THUMB_PX px 四方）— 一覧・ヘッダー・履歴用。 */
  thumb: File;
}

export interface ImageCropModalProps {
  /** 切り抜く元ファイル（null ならモーダルを閉じた状態）。 */
  file: File | null;
  onCancel: () => void;
  /** 切り抜き後の正方形画像（大・小の 2 枚）。 */
  onConfirm: (cropped: CroppedImages) => void;
  title?: string;
  confirmLabel?: string;
  /** 切り抜き枠を円で見せる（アバター用）。 */
  circular?: boolean;
  loading?: boolean;
}

export function ImageCropModal({
  file,
  onCancel,
  onConfirm,
  title: titleProp,
  confirmLabel: confirmLabelProp,
  circular = true,
  loading = false,
}: ImageCropModalProps) {
  const tr = useTranslations();
  const title = titleProp ?? tr("ui.imageCropModal.cropThePhoto");
  const confirmLabel = confirmLabelProp ?? tr("ui.imageCropModal.setThisRange");
  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  /** 接地中のポインタ（ピンチ判定用）。 */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  /** 2 本指の間隔（px）。 */
  const pointerDistance = (): number => {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // 選択されたファイルを読み込む（毎回リセット）。
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setImage(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setError(tr("ui.imageCropModal.couldNotLoadTheImage"));
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, tr]);

  /** 表示倍率: 短辺がビューポートにちょうど収まる比率 × scale。 */
  const baseFit = image
    ? VIEW / Math.min(image.naturalWidth, image.naturalHeight)
    : 1;
  const drawScale = baseFit * scale;
  const drawW = image ? image.naturalWidth * drawScale : 0;
  const drawH = image ? image.naturalHeight * drawScale : 0;

  /** はみ出しの範囲内に位置を収める（枠内に必ず画像が満ちるように）。 */
  const clamp = useCallback(
    (next: Offset): Offset => {
      const maxX = Math.max(0, (drawW - VIEW) / 2);
      const maxY = Math.max(0, (drawH - VIEW) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [drawW, drawH],
  );

  // 拡大率が変わったら位置を制限内へ戻す。
  useEffect(() => {
    setOffset((o) => clamp(o));
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // 2 本目が触れた時点をピンチの基準にする。
      pinchRef.current = { distance: pointerDistance(), scale };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // ピンチ（2 本指）— 指の間隔の比で拡大率を決める。
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const d = pointerDistance();
      if (pinch.distance > 0 && d > 0) {
        setScale(
          Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, (pinch.scale * d) / pinch.distance),
          ),
        );
      }
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    setOffset(
      clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!image) return;
    setScale((s) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.002)),
    );
  };

  /** 表示状態 → 元画像上の切り抜き矩形（px）。 */
  const cropRect = () => {
    // ビューポート左上が元画像のどこに当たるか（表示 px → 元 px）。
    const sx = (drawW / 2 - offset.x - VIEW / 2) / drawScale;
    const sy = (drawH / 2 - offset.y - VIEW / 2) / drawScale;
    const size = VIEW / drawScale;
    return { sx, sy, size };
  };

  /** 切り抜き範囲を 1 辺 out px の JPEG にする。 */
  const renderSquare = (
    img: HTMLImageElement,
    rect: { sx: number; sy: number; size: number },
    out: number,
  ): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    // JPEG は透過を保持できないため、透過部分は白で埋める。
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, rect.sx, rect.sy, rect.size, rect.size, 0, 0, out, out);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  };

  const confirm = async () => {
    if (!image || !file) return;
    const rect = cropRect();
    // 元画像より大きく引き伸ばさない。
    const fullPx = Math.max(64, Math.min(OUTPUT_MAX, Math.round(rect.size)));
    const thumbPx = Math.min(THUMB_PX, fullPx);
    const [fullBlob, thumbBlob] = await Promise.all([
      renderSquare(image, rect, fullPx),
      renderSquare(image, rect, thumbPx),
    ]);
    if (!fullBlob || !thumbBlob) {
      setError(tr("ui.imageCropModal.couldNotCropIt"));
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    const at = Date.now();
    onConfirm({
      full: new File([fullBlob], `${base}.jpg`, {
        type: "image/jpeg",
        lastModified: at,
      }),
      thumb: new File([thumbBlob], `${base}-thumb.jpg`, {
        type: "image/jpeg",
        lastModified: at,
      }),
    });
  };

  return (
    <Modal
      centered
      onClose={onCancel}
      opened={file !== null}
      size="auto"
      title={title}
    >
      <Stack align="center" gap="md">
        <Text c="dimmed" size="xs" ta="center">
          {tr("ui.imageCropModal.dragToPositionItUseThe")}
        </Text>

        {/* 切り抜きビューポート */}
        <Box
          onPointerCancel={endDrag}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onWheel={onWheel}
          style={{
            position: "relative",
            width: VIEW,
            height: VIEW,
            maxWidth: "100%",
            overflow: "hidden",
            borderRadius: circular ? "50%" : "var(--mantine-radius-md)",
            background: "var(--mantine-color-gray-2)",
            cursor: image ? "grab" : "default",
            touchAction: "none",
            border: "1px solid var(--mantine-color-default-border)",
          }}
        >
          {url && (
            // biome-ignore lint/performance/noImgElement: ローカル objectURL のプレビュー — next/image は不要
            <img
              alt=""
              draggable={false}
              src={url}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: drawW,
                height: drawH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                maxWidth: "none",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
        </Box>

        {/* 拡大縮小 */}
        <Group gap="sm" w="100%" wrap="nowrap">
          <IconZoomOut
            color="var(--mantine-color-dimmed)"
            size={16}
            style={{ flexShrink: 0 }}
          />
          <Slider
            disabled={!image}
            label={(v) => `${v.toFixed(1)}x`}
            max={MAX_SCALE}
            min={MIN_SCALE}
            onChange={setScale}
            step={0.05}
            style={{ flex: 1 }}
            value={scale}
          />
          <IconZoomIn
            color="var(--mantine-color-dimmed)"
            size={16}
            style={{ flexShrink: 0 }}
          />
        </Group>

        {error && (
          <Text c="red" size="xs">
            {error}
          </Text>
        )}

        <Group justify="space-between" w="100%">
          <GhostButton
            disabled={!image}
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            size="xs"
          >
            {tr("common.reset2")}
          </GhostButton>
          <Group gap="xs">
            <CancelButton onClick={onCancel} />
            <PrimaryButton
              disabled={!image}
              loading={loading}
              onClick={confirm}
              type="button"
            >
              {confirmLabel}
            </PrimaryButton>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
