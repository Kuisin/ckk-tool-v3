"use client";

/**
 * LiveElapsed.tsx — 作業時間のリアルタイム表示（1 秒ごとに更新）。
 *
 * `baseMs` はサーバー描画時点の累計作業時間（work_order_step_actuals の合算 —
 * 同時実行セグメントは按分済み）。`running` が true（＝自分が作業中）の間だけ、
 * マウントからの経過 × `rate`（= 1 / 現在の同時作業数）を足して毎秒進める。
 * 一時停止・完了中は加算しない（累計値のまま静止表示）。
 */

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/steps-core";

type Props = { baseMs: number; running: boolean; rate?: number };

export function LiveElapsed({ baseMs, running, rate = 1 }: Props) {
  const [ms, setMs] = useState(baseMs);

  useEffect(() => {
    setMs(baseMs);
    if (!running) return;
    const start = Date.now();
    const id = setInterval(
      () => setMs(baseMs + (Date.now() - start) * rate),
      1000,
    );
    return () => clearInterval(id);
  }, [baseMs, running, rate]);

  return <>{formatElapsed(ms)}</>;
}
