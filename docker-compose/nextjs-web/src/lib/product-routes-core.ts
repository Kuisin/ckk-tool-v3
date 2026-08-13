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
  factoryId: number | null;
  supplierBpId: string | null;
}

/**
 * 工程スナップショット列の等価判定（順序込み）。
 * sortOrder は連番とは限らない（並び順のみ意味を持つ）ため、両辺を
 * sortOrder で整列した上で (工程, 実施場所, 工場, 仕入先) の列として比較する。
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
      (s.factoryId ?? null) === (t.factoryId ?? null) &&
      (s.supplierBpId ?? null) === (t.supplierBpId ?? null)
    );
  });
}

/**
 * 製造分（MANUFACTURE）指示書の予定数量の下限（§4 在庫考慮）。
 * 受注数量 − この受注へ引当済みの製品在庫 − 同じ受注の他の製造指示の予定数量。
 * 不良予備分として下限より多く設定するのは常に許容（上限なし）。
 * 過剰引当・分割済みで 0 以下になる場合は下限なし（0）。
 */
export function computePlannedFloor(input: {
  soQuantity: number;
  reservedForSo: number;
  otherManufacture: number;
}): number {
  return Math.max(
    0,
    input.soQuantity - input.reservedForSo - input.otherManufacture,
  );
}

// ── client-safe view 型（server の listProductRoutes → client panel/builder） ──

export interface RouteVersionStepView {
  processStepId: number;
  name: string;
  category: string;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryName: string | null;
  supplierName: string | null;
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

/** 指示書ビルダーの在庫フロア表示・下限検証用。 */
export interface StockFloorInfo {
  soQuantity: number;
  reservedForSo: number;
  otherManufacture: number;
  floor: number;
}
