/**
 * product-routes.ts — 製品工程ルート（工程リスト）の Prisma ラッパ。server-only.
 *
 * バージョンは不変スナップショット（作成のみ）。最新 = max(version)。
 * 「変更されたか」の判定は lib/product-routes-core.ts の routeStepsEqual。
 * 指示書作成/更新からの自動バージョン保存は resolveRouteVersionTx が入口
 * （呼び出し側のトランザクション内で実行する）。
 */

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { Tr } from "./i18n";
import {
  type RouteStepSnapshot,
  type RouteView,
  routeStepsEqual,
} from "./product-routes-core";
import type { ProcessRouteKind } from "./workflow-core";

type Tx = PrismaNS.TransactionClient;

const ROUTE_VERSION_INCLUDE = {
  steps: {
    include: {
      processStep: { select: { name: true, category: true } },
      plant: { select: { name: true } },
      supplierBp: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
};

const ROUTE_INCLUDE = {
  customerBp: { select: { name: true } },
  versions: {
    include: ROUTE_VERSION_INCLUDE,
    orderBy: { version: "desc" as const },
  },
};

/**
 * 製品の製造工程リスト一覧（バージョン降順・工程サマリ付き）— 製品詳細/ビルダー用。
 *
 * `itemId` は **items.id**（製品マスタの URL id / ビルダーの製品ピッカーの値）。
 * 以前は products.id を受けて中で 1 回変換していたが、呼び出し側が品目へ移った
 * あとも引数名が productId のままだったため、**製品マスタ (MS04) が品目 id を
 * 旧 id として渡し、別の製品のリストを引いていた**（どちらも number なので型は
 * 通る）。受け取る意味を列名に出して、同じ取り違えを繰り返せなくする。
 */
export async function listProductRoutes(itemId: number): Promise<RouteView[]> {
  const routes = await prisma.productProcessRoute.findMany({
    where: { itemId, kind: "MANUFACTURING" },
    include: ROUTE_INCLUDE,
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
  });
  return routes.map(mapRoute);
}

/**
 * 準備工程リスト一覧（共通 — 製品にも顧客にも紐づかない）。
 * 工程マスタ配下（/master/process-steps/prep-routes）とビルダーが読む。
 */
export async function listPrepRoutes(): Promise<RouteView[]> {
  return listCommonRoutes("PREP");
}

/**
 * 再研磨工程リスト一覧（共通 — 製品にも顧客にも紐づかない）。
 * 工程マスタ配下（/master/process-steps/regrind-routes）と再研磨指示書のビルダーが読む。
 */
export async function listRegrindRoutes(): Promise<RouteView[]> {
  return listCommonRoutes("REGRIND");
}

/** 共通リスト（準備 / 再研磨）の一覧。 */
export async function listCommonRoutes(
  kind: "PREP" | "REGRIND",
): Promise<RouteView[]> {
  const routes = await prisma.productProcessRoute.findMany({
    where: { kind },
    include: ROUTE_INCLUDE,
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
  });
  return routes.map(mapRoute);
}

type RouteRow = PrismaNS.ProductProcessRouteGetPayload<{
  include: typeof ROUTE_INCLUDE;
}>;

function mapRoute(r: RouteRow): RouteView {
  return {
    id: r.id,
    kind: r.kind,
    name: localized(r.name as LocalizedText | null),
    nameEn: (r.name as LocalizedText | null)?.en ?? "",
    customerBpId: r.customerBpId,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    isActive: r.isActive,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    versions: r.versions.map((v) => ({
      id: v.id,
      version: v.version,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      steps: v.steps.map((s) => ({
        processStepId: s.processStepId,
        name: localized(s.processStep.name as LocalizedText | null),
        category: s.processStep.category,
        executionLocation: s.executionLocation,
        plantName: s.plant
          ? localized(s.plant.name as LocalizedText | null)
          : null,
        supplierName: s.supplierBp
          ? localized(s.supplierBp.name as LocalizedText | null)
          : null,
        workHours: s.workHours == null ? null : Number(s.workHours),
      })),
    })),
  };
}

/** バージョンの工程スナップショット（ビルダーのプリフィル・比較基準）。 */
export async function fetchRouteVersionSteps(
  versionId: string,
): Promise<RouteStepSnapshot[]> {
  const rows = await prisma.productProcessRouteVersionStep.findMany({
    where: { routeVersionId: versionId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((s) => ({
    processStepId: s.processStepId,
    sortOrder: s.sortOrder,
    executionLocation: s.executionLocation,
    plantId: s.plantId,
    supplierBpId: s.supplierBpId,
    workHours: s.workHours == null ? null : Number(s.workHours),
    lotInputMode: s.lotInputMode,
  }));
}

/**
 * 新バージョン作成（呼び出し側 tx 内）。ルート行を FOR UPDATE でロックして
 * max(version)+1 を採番する（@@unique(routeId, version) がバックストップ）。
 */
export async function createRouteVersionTx(
  tx: Tx,
  input: {
    routeId: number;
    steps: readonly RouteStepSnapshot[];
    actor: string | null;
    notes?: string | null;
  },
): Promise<{ id: string; version: number }> {
  await tx.$queryRaw`SELECT id FROM app.product_process_routes WHERE id = ${input.routeId} FOR UPDATE`;
  const agg = await tx.productProcessRouteVersion.aggregate({
    where: { routeId: input.routeId },
    _max: { version: true },
  });
  const version = (agg._max.version ?? 0) + 1;
  const created = await tx.productProcessRouteVersion.create({
    data: {
      routeId: input.routeId,
      version,
      notes: input.notes?.trim() || null,
      createdBy: input.actor,
      steps: {
        create: input.steps.map((s, i) => ({
          processStepId: s.processStepId,
          sortOrder: i,
          executionLocation: s.executionLocation,
          plantId: s.plantId,
          supplierBpId: s.supplierBpId,
          workHours: s.workHours,
          lotInputMode: s.lotInputMode ?? null,
        })),
      },
    },
    select: { id: true, version: true },
  });
  // ルートの updatedAt を進める（一覧の並び・鮮度表示用）
  await tx.productProcessRoute.update({
    where: { id: input.routeId },
    data: { updatedAt: new Date() },
  });
  return created;
}

/**
 * ルート新規作成 + v1（呼び出し側 tx 内）。
 * kind = PREP は品目にも顧客にも紐づかない（DB の CHECK が守る — ここで
 * 渡された itemId / customerBpId は捨てる）。
 *
 * `itemId` は **items.id**（製品品目）。
 */
export async function createRouteWithVersionTx(
  tx: Tx,
  input: {
    kind?: ProcessRouteKind;
    itemId: number | null;
    name: LocalizedText;
    /** 対象の受注元。null/未指定 = 汎用ルート。 */
    customerBpId?: string | null;
    steps: readonly RouteStepSnapshot[];
    actor: string | null;
    notes?: string | null;
  },
): Promise<{ routeId: number; versionId: string }> {
  const kind = input.kind ?? "MANUFACTURING";
  if (kind === "MANUFACTURING" && input.itemId == null) {
    throw new Error("manufacturing route requires itemId");
  }
  if (kind === "MANUFACTURING" && input.itemId != null) {
    // 他社製品（再研磨専用）には製造工程リストを作らない — 最後の砦。
    const item = await tx.item.findUnique({
      where: { id: input.itemId },
      select: { isExternalProduct: true },
    });
    if (item?.isExternalProduct) {
      throw new Error("external product cannot have a manufacturing route");
    }
  }
  // 共通リスト（準備 / 再研磨）は品目にも顧客にも紐づかない（DB の CHECK）。
  const common = kind !== "MANUFACTURING";
  const route = await tx.productProcessRoute.create({
    data: {
      kind,
      itemId: common ? null : input.itemId,
      customerBpId: common ? null : (input.customerBpId ?? null),
      name: input.name,
      createdBy: input.actor,
    },
    select: { id: true },
  });
  const v = await createRouteVersionTx(tx, {
    routeId: route.id,
    steps: input.steps,
    actor: input.actor,
    notes: input.notes,
  });
  return { routeId: route.id, versionId: v.id };
}

export type RouteResolveInput =
  | { mode: "existing"; routeId: number; baseVersionId: string }
  | { mode: "new"; name: string; customerBpId?: string | null }
  | null;

/**
 * どちらの種別として解決するか。`prepStepIds` は カタログの準備工程 id
 * （workflow-core isPrepStep）— 移行前の混ざった版を種別ごとの部分だけで
 * 比べるために要る。
 */
export interface RouteResolveScope {
  kind: ProcessRouteKind;
  prepStepIds: ReadonlySet<number>;
  /**
   * その種別に属する工程か（省略時は prepStepIds から PREP / それ以外 で決める）。
   * 再研磨は 3 つ目の区分なので、呼び出し側が stepAllowedForType で渡す。
   */
  inKind?: (stepId: number) => boolean;
}

/**
 * 指示書の工程構成 → ルートバージョンの解決（「変更は常に新バージョン保存」）。
 * - null: ルートを使わない（ad-hoc 構成、保存しない）→ null
 * - existing: 基準バージョンと同一なら再利用、違えば新バージョンを作成
 * - new: 名前付きの新ルート v1 として保存
 * ルート/バージョンが対象製品・対象種別のものであることを検証する（不一致は
 * throw — 呼び出し側の prismaErrorMessage で表面化）。
 *
 * `steps` は**その種別の工程だけ**を渡すこと（呼び出し側が splitStepIdsByKind で
 * 分ける）。比較の基準側も同じ種別の部分だけを見る — 移行前の製造リストには
 * 準備工程が混ざっているので、全体で比べると「必ず変わっている」ことになり、
 * 指示書を 1 枚作るたびに新バージョンが生えてしまう。
 */
export async function resolveRouteVersionTx(
  tx: Tx,
  input: RouteResolveInput,
  steps: readonly RouteStepSnapshot[],
  actor: string | null,
  itemId: number,
  tr: Tr,
  notes: string | null | undefined,
  scope: RouteResolveScope,
): Promise<string | null> {
  if (input == null) return null;
  // その種別の工程が 1 つも無いのに版を作っても中身が空になるだけ。
  if (steps.length === 0) return null;
  const inKind =
    scope.inKind ??
    ((id: number) =>
      scope.kind === "PREP"
        ? scope.prepStepIds.has(id)
        : !scope.prepStepIds.has(id));
  if (input.mode === "new") {
    const created = await createRouteWithVersionTx(tx, {
      kind: scope.kind,
      itemId,
      name: { ja: input.name, en: input.name },
      customerBpId: input.customerBpId ?? null,
      steps,
      actor,
    });
    return created.versionId;
  }
  const base = await tx.productProcessRouteVersion.findUnique({
    where: { id: input.baseVersionId },
    include: {
      route: { select: { id: true, itemId: true, kind: true } },
      steps: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (
    !base ||
    base.route.id !== input.routeId ||
    base.route.kind !== scope.kind ||
    (scope.kind === "MANUFACTURING" && base.route.itemId !== itemId)
  ) {
    throw new Error(
      tr("production.productRoutes.theSelectedProcessRouteIsNot"),
    );
  }
  const baseSteps: RouteStepSnapshot[] = base.steps
    .filter((s) => inKind(s.processStepId))
    .map((s) => ({
      processStepId: s.processStepId,
      sortOrder: s.sortOrder,
      executionLocation: s.executionLocation,
      plantId: s.plantId,
      supplierBpId: s.supplierBpId,
      workHours: s.workHours == null ? null : Number(s.workHours),
      lotInputMode: s.lotInputMode,
    }));
  if (routeStepsEqual(baseSteps, steps)) return input.baseVersionId;
  const created = await createRouteVersionTx(tx, {
    routeId: input.routeId,
    steps,
    actor,
    notes,
  });
  return created.id;
}

/**
 * 他の受注元専用の製造工程リストの版を、この受注元の新しいリストとして複製する
 * （呼び出し側 tx 内）。中身は版そのまま（移行前の版なら準備工程も一緒に写る —
 * ビルダーが読んだときに分ける）。名前は元のまま。備考に出どころを残す。
 */
export async function copyRouteVersionToCustomerTx(
  tx: Tx,
  input: {
    versionId: string;
    customerBpId: string;
    actor: string | null;
    tr: Tr;
  },
): Promise<{ routeId: number; versionId: string }> {
  const base = await tx.productProcessRouteVersion.findUnique({
    where: { id: input.versionId },
    include: {
      route: {
        select: { id: true, kind: true, itemId: true, name: true },
      },
      steps: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (
    !base ||
    base.route.kind !== "MANUFACTURING" ||
    base.route.itemId == null
  ) {
    throw new Error(
      input.tr("production.productRoutes.theSelectedProcessRouteIsNot"),
    );
  }
  return createRouteWithVersionTx(tx, {
    kind: "MANUFACTURING",
    itemId: base.route.itemId,
    customerBpId: input.customerBpId,
    name: base.route.name as LocalizedText,
    steps: base.steps.map((s) => ({
      processStepId: s.processStepId,
      sortOrder: s.sortOrder,
      executionLocation: s.executionLocation,
      plantId: s.plantId,
      supplierBpId: s.supplierBpId,
      workHours: s.workHours == null ? null : Number(s.workHours),
      lotInputMode: s.lotInputMode,
    })),
    actor: input.actor,
    notes: input.tr("production.productRoutes.copiedFromVersionNote", {
      name: localized(base.route.name as LocalizedText | null),
      version: base.version,
    }),
  });
}
