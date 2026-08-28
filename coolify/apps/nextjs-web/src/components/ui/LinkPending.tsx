"use client";

/**
 * LinkPending — 押した `<Link>` 自身に「いま移動中」を出す。
 *
 * **`<Link>` の子として置くこと。** `useLinkStatus` はその Link の遷移状態を
 * 読むので、外に置くと常に false になる。
 *
 * なぜ要るか: ダッシュボード配下は全ページ `force-dynamic` なので、次の画面の
 * サーバー処理が終わるまで表示は前の画面のまま。押した手応えが無く「効いて
 * いない」と感じて二度押しされる。カード自身にすぐ反応を出すと、体感が
 * 「待たされている」から「進んでいる」に変わる。
 *
 * 画面側の骨組みは `app/(dashboard)/loading.tsx` が出す。こちらは
 * **押した場所**の反応で、役割が違う（両方あって初めて途切れない）。
 */

import { Loader, Overlay } from "@mantine/core";
import { useLinkStatus } from "next/link";

export function LinkPending({ radius = "md" }: { radius?: string | number }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <Overlay
      // 中身を隠さない程度に白を敷いて、進行中だと分かるだけにする。
      backgroundOpacity={0.55}
      blur={0}
      color="var(--mantine-color-body)"
      radius={radius}
      // クリックはもう受け付けない（二度押しで 2 回遷移させない）
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
      }}
      zIndex={1}
    >
      <Loader size="sm" />
    </Overlay>
  );
}
