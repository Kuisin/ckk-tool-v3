"use client";

/**
 * PrepRoutesPanel — 準備工程リスト（共通）の一覧ページ（工程マスタ MS08 配下）。
 * 中身は CommonRoutesPanel（準備 / 再研磨 で共用）。
 */

import type { RouteView } from "@/lib/product-routes-core";
import { CommonRoutesPanel } from "./CommonRoutesPanel";

export function PrepRoutesPanel({ routes }: { routes: RouteView[] }) {
  return <CommonRoutesPanel kind="PREP" routes={routes} />;
}
