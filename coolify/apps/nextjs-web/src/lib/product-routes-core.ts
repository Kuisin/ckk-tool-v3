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
  /** ロット入力の上書き（null = 工程マスタの既定を継承）。 */
  lotInputMode?: "REQUIRED" | "OPTIONAL" | "NONE" | null;
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
      (s.workHours ?? null) === (t.workHours ?? null) &&
      (s.lotInputMode ?? null) === (t.lotInputMode ?? null)
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
  /** 準備工程リスト（共通）か 製造工程リスト（製品 × 受注元）か。 */
  kind: "PREP" | "MANUFACTURING";
  name: string;
  nameEn: string;
  /** 対象の受注元（取引先）。null = 汎用（どの顧客にも使える）。 */
  customerBpId: string | null;
  customerName: string | null;
  isActive: boolean;
  notes: string | null;
  updatedAt: string;
  /** version 降順（先頭 = 最新）。 */
  versions: RouteVersionView[];
}

/**
 * ビルダーの既定ルート選択（唯一の優先規則）:
 * 顧客一致ルート → 汎用ルート（customerBpId null）→ 先頭、の順。
 * 他顧客専用のルートは自動選択しない（手動選択は可能）。
 */
export function pickDefaultRoute(
  routes: readonly RouteView[],
  customerBpId: string | null,
): RouteView | null {
  if (routes.length === 0) return null;
  if (customerBpId != null) {
    const match = routes.find((r) => r.customerBpId === customerBpId);
    if (match) return match;
  }
  return routes.find((r) => r.customerBpId == null) ?? routes[0];
}

/**
 * 指示書ビルダーに**既定で見せる**製造工程リスト — この受注元のものと汎用だけ。
 *
 * 他の受注元専用のリストは、同じ製品でも顧客ごとに工程が違うから分けている
 * もので、既定で並べると「隣の顧客のリストで作ってしまう」事故の入口になる。
 * `showOthers` を立てたときだけ全部出す（見比べて、この顧客へ複製するため）。
 * 受注元が無い（在庫向け）ときは絞りようがないので全部出す。
 */
export function routesVisibleForCustomer(
  routes: readonly RouteView[],
  customerBpId: string | null,
  showOthers: boolean,
): RouteView[] {
  if (showOthers || customerBpId == null) return [...routes];
  return routes.filter(
    (r) => r.customerBpId == null || r.customerBpId === customerBpId,
  );
}

/** 他の受注元専用のリストか（= 選んだら「この顧客へ複製」を勧める相手）。 */
export function isOtherCustomerRoute(
  route: Pick<RouteView, "customerBpId">,
  customerBpId: string | null,
): boolean {
  return (
    customerBpId != null &&
    route.customerBpId != null &&
    route.customerBpId !== customerBpId
  );
}

/**
 * 準備工程リストの既定選択。共通のリストなので優先規則は無い —
 * **有効なものが 1 本だけのときだけ**自動で選ぶ。2 本以上あるのは
 * 「素材の仕立てが複数ある」という意思表示なので、人に選ばせる。
 */
export function pickDefaultPrepRoute(
  prepRoutes: readonly RouteView[],
): RouteView | null {
  const active = prepRoutes.filter((r) => r.isActive);
  return active.length === 1 ? active[0] : null;
}
