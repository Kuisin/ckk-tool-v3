/**
 * product-routes-core.ts — 製品工程ルート（工程リスト）の純ロジック + client-safe 型。
 *
 * ルートのバージョンは不変スナップショット。指示書作成時にルートを選ぶと工程
 * 構成がプリフィルされ、変更された場合は常に新バージョンとして保存される。
 * 「変更されたか」の判定は routeStepsEqual が唯一の基準（client のバナー表示と
 * server の新バージョン作成判定で共用 — Prisma I/O なし）。
 */

/** バージョンの工程スナップショット 1 行（= 指示書ビルダーが採取する項目）。 */
export interface RouteStepSnapshot {
  processStepId: number;
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  plantId: number | null;
  supplierBpId: string | null;
  /** 標準作業時間 (h) — 任意。 */
  workHours: number | null;
}

/**
 * 工程スナップショット列の等価判定（順序込み）。
 * sortOrder は連番とは限らない（並び順のみ意味を持つ）ため、両辺を
 * sortOrder で整列した上で (工程, 実施場所, 拠点, 仕入先) の列として比較する。
 */
export function routeStepsEqual(
  a: readonly RouteStepSnapshot[],
  b: readonly RouteStepSnapshot[],
): boolean {
  if (a.length !== b.length) return false;
  const sorted = (list: readonly RouteStepSnapshot[]) =>
    [...list].sort(
      (x, y) => x.sortOrder - y.sortOrder || x.processStepId - y.processStepId,
    );
  const sa = sorted(a);
  const sb = sorted(b);
  return sa.every((s, i) => {
    const t = sb[i];
    return (
      s.processStepId === t.processStepId &&
      s.executionLocation === t.executionLocation &&
      (s.plantId ?? null) === (t.plantId ?? null) &&
      (s.supplierBpId ?? null) === (t.supplierBpId ?? null) &&
      (s.workHours ?? null) === (t.workHours ?? null)
    );
  });
}

// ── client-safe view 型（server の listProductRoutes → client panel/builder） ──

export interface RouteVersionStepView {
  processStepId: number;
  name: string;
  category: string;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  plantName: string | null;
  supplierName: string | null;
  /** 標準作業時間 (h) — 任意。 */
  workHours: number | null;
}

export interface RouteVersionView {
  id: string;
  version: number;
  notes: string | null;
  createdAt: string;
  steps: RouteVersionStepView[];
}

export interface RouteView {
  id: number;
  name: string;
  nameEn: string;
  isActive: boolean;
  notes: string | null;
  updatedAt: string;
  /** version 降順（先頭 = 最新）。 */
  versions: RouteVersionView[];
}
