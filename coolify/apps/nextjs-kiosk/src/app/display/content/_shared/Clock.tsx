"use client";

/**
 * Clock — 時計。**「この画面は生きている」が一目で分かる**ためのもの。
 *
 * 止まった画面と、単に変化の無い画面は、遠くから見分けられない。針が動いて
 * いれば少なくとも描画は生きていると分かる。
 *
 * 置き場所は 2 つある:
 *   画面共通の見出し（DisplayShell）… 小さく、常に出る
 *   お知らせテンプレートの本文       … 大きく、設定で出し入れする
 * どちらも同じ部品を使う（別々に書くと片方だけ時刻の書式が変わる）。
 */

import { Text } from "@mantine/core";
import { useEffect, useState } from "react";

export function Clock({ fontSize = "1.8rem" }: { fontSize?: string }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  // 初回描画は空 — サーバーとクライアントで時刻がずれるため（hydration）
  return (
    <Text ff="monospace" fw={600} style={{ fontSize }}>
      {now}
    </Text>
  );
}
