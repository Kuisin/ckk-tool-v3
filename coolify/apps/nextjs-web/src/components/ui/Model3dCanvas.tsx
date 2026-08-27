"use client";

/**
 * Model3dCanvas — 3D モデルの表示（online-3d-viewer / MIT）。
 *
 * **描画層に限定する。** どの形式を「見せてよいか」の判定は
 * `lib/design-file-kind.ts` が持ち、ここはもらった URL を描くだけ。
 * React Flow のときと同じ約束で、ライブラリに業務判断をさせない。
 *
 * O3DV は document / WebGL を直に触るので **必ず ssr:false で読み込むこと**
 * （エントリは Model3dViewer.tsx。ここを直接 import しない）。
 *
 * npm の online-3d-viewer はエンジンだけを同梱していて、STEP / IGES / 3DM /
 * IFC が要る wasm は入っていない。そのため対応形式は
 * design-file-kind.ts の MODEL_3D_EXT に絞ってある。
 *
 * ⚠️ **URL ではなく File を渡すこと。** O3DV は読み込むファイルの
 * **拡張子**でインポータを選ぶ（o3dv.module.js の GetFileExtension）。
 * 配信 URL は /api/design-files/<uuid> で拡張子が無いため、
 * LoadModelFromUrlList に渡すと拡張子が空になり、どのインポータにも
 * 一致せず必ず読み込みに失敗する。自分で fetch して**本来のファイル名**を
 * 持つ File を作り、LoadModelFromFileList に渡す。
 */

import { Box, Center, Loader, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

export function Model3dCanvas({
  src,
  filename,
  height = 420,
}: {
  /** モデルの URL（/api/design-files/<id> など）。 */
  src: string;
  /** 本来のファイル名。**拡張子がインポータの選択に要る。** */
  filename: string;
  height?: number | string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let disposed = false;
    // biome-ignore lint/suspicious/noExplicitAny: O3DV の EmbeddedViewer は型を公開していない
    let viewer: any = null;

    void (async () => {
      try {
        // 先にバイト列を取る（同一オリジンなので Cookie 認証がそのまま効く）。
        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        if (disposed) return;
        const OV = await import("online-3d-viewer");
        if (disposed || !holder.current) return;
        viewer = new OV.EmbeddedViewer(holder.current, {
          backgroundColor: new OV.RGBAColor(255, 255, 255, 255),
          defaultColor: new OV.RGBColor(120, 130, 140),
          onModelLoaded: () => {
            if (!disposed) setState("ready");
          },
          onModelLoadFailed: () => {
            if (!disposed) setState("error");
          },
        });
        // 拡張子付きの File として渡す（URL 経由だと拡張子が無く失敗する）。
        viewer.LoadModelFromFileList([
          new File([blob], filename, { type: blob.type }),
        ]);
      } catch {
        if (!disposed) setState("error");
      }
    })();

    return () => {
      disposed = true;
      // EmbeddedViewer は Destroy を持たない版があるので、生成した DOM ごと畳む
      // （残すと WebGL コンテキストが溜まってタブが落ちる）。
      try {
        viewer?.viewer?.renderer?.dispose?.();
      } catch {
        // 破棄に失敗しても画面は閉じる
      }
      if (el) el.replaceChildren();
    };
  }, [src, filename]);

  return (
    <Box pos="relative" style={{ height, width: "100%" }}>
      <div ref={holder} style={{ height: "100%", width: "100%" }} />
      {state !== "ready" && (
        <Center
          pos="absolute"
          style={{ inset: 0, pointerEvents: "none" }}
          // 読み込み中は薄く敷き、失敗したら文言を残す
        >
          {state === "loading" ? (
            <Stack align="center" gap="xs">
              <Loader size="sm" />
              <Text c="dimmed" size="xs">
                3D モデルを読み込んでいます…
              </Text>
            </Stack>
          ) : (
            <Text c="dimmed" size="sm">
              このファイルは表示できませんでした（ダウンロードしてご覧ください）
            </Text>
          )}
        </Center>
      )}
    </Box>
  );
}
