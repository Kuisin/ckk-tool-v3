/**
 * data.ts — 設計図 (PD06) のサーバーサイド取得・マッピング。
 *
 * 版は **(製品 × 受注元)** ごとの系列で育ち、1 版 = design_versions の 1 行
 * （ファイル 0 枚の版もある — 仕様だけの版）。系列の束ね方は
 * `lib/design-files-core.ts` の `groupVersionsBySeries` / `sameSeries` に寄せる
 * （一覧・詳細・製品マスタが同じ並びになる唯一の理由）。
 *
 * **確定していない版（下書き・承認依頼中・差し戻し）は設計図の画面にだけ出る。**
 * 指示書・製品マスタは確定済みの版しか読まない（is_latest は確定で立つ）。
 */

import { getTranslations } from "next-intl/server";
import type {
  DesignFileRole,
  DesignFileSeriesRow,
  DesignVersionView,
  ProductDesignFile,
} from "@/components/production/design-files/model";
import { prisma } from "@/lib/db";
import { toDesignExtract } from "@/lib/design-extract-core";
import {
  compareRole,
  type DesignVersionStatus,
  groupVersionsBySeries,
  resolveSeriesCustomer,
  toTitleBlock,
} from "@/lib/design-files-core";
import { specRecord } from "@/lib/design-spec-core";
import { type LocalizedText, localized } from "@/lib/format";

/**
 * 一覧の取得上限。系列ではなく **版** の行数に効く点に注意 — 系列は版を
 * 束ねた結果なので、ここで切ると系列そのものが落ちる。
 */
const LIST_FETCH_CAP = 2000;

/** 品目（items.id）の見出し用ラベル（名称 + コード）。 */
function itemLabelOf(item: { name: unknown; code: string | null }): string {
  const name = localized(item.name as LocalizedText | null);
  return item.code ? `${name} ${item.code}` : name;
}

const DESIGN_FILE_INCLUDE = {
  file: { select: { filename: true, mimeType: true } },
  designRequest: { select: { requestNumber: true } },
  customerBp: { select: { name: true } },
  designVersion: { select: { status: true } },
} as const;

/** design_files 1 行 → 画面の型（取り出し方をここ 1 箇所に閉じる）。 */
type DesignFileRow = {
  id: string;
  version: number;
  isLatest: boolean;
  role: string;
  notes: string | null;
  createdAt: Date;
  customerBpId: string | null;
  designRequestId: string | null;
  designVersionId: string;
  file: { filename: string; mimeType: string };
  designRequest: { requestNumber: string } | null;
  customerBp: { name: unknown } | null;
  designVersion: { status: string };
};

function toProductDesignFile(f: DesignFileRow): ProductDesignFile {
  return {
    id: f.id,
    version: f.version,
    isLatest: f.isLatest,
    role: f.role as DesignFileRole,
    mimeType: f.file.mimeType,
    filename: f.file.filename,
    requestNumber: f.designRequest?.requestNumber ?? null,
    designRequestId: f.designRequestId,
    customerBpId: f.customerBpId,
    customerName: localized(f.customerBp?.name as LocalizedText | null) || null,
    designVersionId: f.designVersionId,
    versionStatus: f.designVersion.status as DesignVersionStatus,
    notes: f.notes,
    createdAt: f.createdAt.toISOString(),
  };
}

/**
 * 製品の設計図ファイル（製品マスタ MS24 の「設計図」タブ）。
 *
 * 製品マスタは**確定済みの版だけ**を出す — そこは「いま何を作るか」を見る
 * 画面で、描きかけの図面が並ぶと取り違える。下書きは設計図 (PD26) で見る。
 * `itemId` は items.id。
 */
export async function fetchDesignFilesForItem(
  itemId: number,
): Promise<ProductDesignFile[]> {
  const rows = await prisma.designFile.findMany({
    where: { itemId, designVersion: { status: "CONFIRMED" } },
    include: DESIGN_FILE_INCLUDE,
    orderBy: [{ version: "desc" }, { role: "asc" }],
    // 版は (製品 × 受注元) ごとに育つので、顧客が増えるほど行が増える。
    take: 200,
  });
  return rows.map((f) => toProductDesignFile(f as DesignFileRow));
}

const VERSION_INCLUDE = {
  customerBp: { select: { name: true } },
  designRequest: { select: { requestNumber: true } },
  materialType: { select: { code: true, name: true } },
  createdByUser: { select: { displayName: true } },
  confirmedByUser: { select: { displayName: true } },
  files: { include: DESIGN_FILE_INCLUDE },
} as const;

type VersionRow = {
  id: string;
  itemId: number;
  version: number;
  status: string;
  customerBpId: string | null;
  designRequestId: string | null;
  notes: string | null;
  materialTypeId: number | null;
  diameterMm: { toString(): string } | null;
  lengthMm: { toString(): string } | null;
  spec: unknown;
  titleBlock: unknown;
  extract: unknown;
  createdAt: Date;
  confirmedAt: Date | null;
  requestedAt: Date | null;
  customerBp: { name: unknown } | null;
  designRequest: { requestNumber: string } | null;
  materialType: { code: string | null; name: unknown } | null;
  createdByUser: { displayName: string } | null;
  confirmedByUser: { displayName: string } | null;
  files: DesignFileRow[];
};

function toVersionView(
  v: VersionRow,
  latestConfirmedIds: Set<string>,
): DesignVersionView {
  return {
    id: v.id,
    itemId: v.itemId,
    version: v.version,
    status: v.status as DesignVersionStatus,
    customerBpId: v.customerBpId,
    customerName: localized(v.customerBp?.name as LocalizedText | null) || null,
    designRequestId: v.designRequestId,
    requestNumber: v.designRequest?.requestNumber ?? null,
    notes: v.notes,
    materialTypeId: v.materialTypeId,
    materialTypeLabel: v.materialType
      ? [
          v.materialType.code,
          localized(v.materialType.name as LocalizedText | null),
        ]
          .filter(Boolean)
          .join(" ")
      : null,
    diameterMm: v.diameterMm != null ? Number(v.diameterMm.toString()) : null,
    lengthMm: v.lengthMm != null ? Number(v.lengthMm.toString()) : null,
    spec: specRecord(v.spec),
    titleBlock: toTitleBlock(v.titleBlock),
    extract: toDesignExtract(v.extract),
    isLatestConfirmed: latestConfirmedIds.has(v.id),
    files: v.files
      .map(toProductDesignFile)
      .sort((a, b) => compareRole(a.role, b.role)),
    createdAt: v.createdAt.toISOString(),
    createdByName: v.createdByUser?.displayName ?? null,
    confirmedAt: v.confirmedAt?.toISOString() ?? null,
    confirmedByName: v.confirmedByUser?.displayName ?? null,
    requestedAt: v.requestedAt?.toISOString() ?? null,
  };
}

/** 系列ごとの確定済み最新版の id。 */
function latestConfirmedIds(
  rows: readonly {
    id: string;
    customerBpId: string | null;
    version: number;
    status: string;
  }[],
): Set<string> {
  const best = new Map<string, { id: string; version: number }>();
  for (const r of rows) {
    if (r.status !== "CONFIRMED") continue;
    const key = r.customerBpId ?? "";
    const cur = best.get(key);
    if (!cur || r.version > cur.version)
      best.set(key, { id: r.id, version: r.version });
  }
  return new Set([...best.values()].map((b) => b.id));
}

/** 製品の全版（設計図 PD26）。系列ごとに並べるのは画面側（groupVersionsBySeries）。 */
export async function fetchDesignVersionsForItem(
  itemId: number,
): Promise<DesignVersionView[]> {
  const rows = await prisma.designVersion.findMany({
    where: { itemId },
    include: VERSION_INCLUDE,
    orderBy: [{ version: "desc" }],
    take: 200,
  });
  const latest = latestConfirmedIds(rows);
  return rows.map((v) => toVersionView(v as VersionRow, latest));
}

/** 版の詳細。存在しなければ null。 */
export async function fetchDesignVersion(id: string): Promise<{
  view: DesignVersionView;
  productLabel: string;
  productCode: string | null;
  history: unknown;
} | null> {
  const v = await prisma.designVersion.findUnique({
    where: { id },
    include: {
      ...VERSION_INCLUDE,
      item: { select: { name: true, code: true } },
    },
  });
  if (!v) return null;
  // 「系列の確定済み最新版か」は同じ系列の確定版だけを見れば判る。
  const siblings = await prisma.designVersion.findMany({
    where: {
      itemId: v.itemId,
      customerBpId: v.customerBpId,
      status: "CONFIRMED",
    },
    select: { id: true, customerBpId: true, version: true, status: true },
  });
  return {
    view: toVersionView(
      v as unknown as VersionRow,
      latestConfirmedIds(siblings),
    ),
    productLabel: itemLabelOf(v.item),
    productCode: v.item.code,
    history: v.history,
  };
}

/**
 * 指示書などに出す「いま何を見て作るか」の 1 件。
 *
 * **受注元で見る系列が変わる。** 顧客一致の系列を優先し、無ければ汎用へ落ちる
 * （他の顧客専用の系列へは決して落ちない — 落とすと B の指示書に A の図面が
 * 黙って出て、気づかないまま違う物を作る）。優先規則は
 * lib/design-files-core resolveSeriesCustomer が唯一の定義元。
 *
 * 役割の優先は PREVIEW → BLUEPRINT。3D プレビュー用に上げたファイルがあれば
 * それを見せ、無ければ 2D 原図（PDF 等）を見せる。is_latest は確定した版にしか
 * 立たないので、下書きの図面はここに出ない。
 */
export async function fetchLatestViewableDesignFile(
  itemId: number,
  customerBpId: string | null = null,
): Promise<ProductDesignFile | null> {
  const rows = await prisma.designFile.findMany({
    where: {
      itemId,
      isLatest: true,
      role: { in: ["PREVIEW", "BLUEPRINT"] },
    },
    include: DESIGN_FILE_INCLUDE,
    orderBy: [{ version: "desc" }, { role: "asc" }],
  });
  if (rows.length === 0) return null;
  const series = resolveSeriesCustomer(
    rows.map((r) => ({
      id: r.id,
      version: r.version,
      isLatest: r.isLatest,
      role: r.role as DesignFileRole,
      customerBpId: r.customerBpId,
      designRequestId: r.designRequestId,
    })),
    customerBpId,
  );
  if (series === undefined) return null;
  // role の enum 順が PREVIEW → BLUEPRINT なので、先頭がそのまま優先分。
  const f = rows.find((r) => (r.customerBpId ?? null) === series);
  return f ? toProductDesignFile(f as DesignFileRow) : null;
}

/**
 * 版を id で 1 件（指示書がピン留めしている版を出すため）。
 * ピン留めは系列の優先規則を**上書きする** — 人が明示的に選んだものが勝つ。
 */
export async function fetchDesignFileById(
  id: string,
): Promise<ProductDesignFile | null> {
  const f = await prisma.designFile.findUnique({
    where: { id },
    include: DESIGN_FILE_INCLUDE,
  });
  return f ? toProductDesignFile(f as DesignFileRow) : null;
}

/**
 * 一覧 (PD06) — 1 行 = 1 系列（製品 × 受注元）。
 *
 * 版を 1 行ずつ並べない理由は model.ts の `DesignFileSeriesRow` に書いた。
 * ファイルの無い版（仕様だけの版）も系列を作る。上限に当たったぶんは黙って
 * 落とさず、呼び出し側へ `truncated` で返して画面に出す（「これで全部」に
 * 見えるのがいちばん困る）。
 */
export async function fetchDesignFileSeries(): Promise<{
  rows: DesignFileSeriesRow[];
  truncated: boolean;
}> {
  const tr = await getTranslations();
  const versions = await prisma.designVersion.findMany({
    include: {
      customerBp: { select: { name: true } },
      item: { select: { id: true, name: true, code: true } },
      files: { select: { role: true, createdAt: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: LIST_FETCH_CAP + 1,
  });
  const truncated = versions.length > LIST_FETCH_CAP;
  const capped = truncated ? versions.slice(0, LIST_FETCH_CAP) : versions;

  // 品目ごとに分けてから系列へ落とす。groupVersionsBySeries は 1 品目ぶんを
  // 前提にした関数なので、品目をまたいで渡すと別製品の同じ受注元が 1 系列になる。
  const byItem = new Map<number, typeof capped>();
  for (const v of capped) {
    const list = byItem.get(v.itemId) ?? [];
    list.push(v);
    byItem.set(v.itemId, list);
  }
  const rows: DesignFileSeriesRow[] = [];
  for (const [itemId, list] of byItem) {
    const item = list[0]?.item;
    const parts = item
      ? { name: localized(item.name as LocalizedText | null), code: item.code }
      : {
          name: tr("shipping.deliveryNoteActions.productFallbackLabel", {
            id: itemId,
          }),
          code: null,
        };
    for (const g of groupVersionsBySeries(list)) {
      const latest = g.versions[0];
      const confirmed = g.versions.find((v) => v.status === "CONFIRMED");
      const updated = g.versions.reduce(
        (max, v) => (v.updatedAt > max ? v.updatedAt : max),
        latest.updatedAt,
      );
      rows.push({
        key: `${itemId}:${g.customerBpId ?? ""}`,
        itemId,
        productName: parts.name,
        productCode: parts.code,
        customerBpId: g.customerBpId,
        customerName:
          localized(latest.customerBp?.name as LocalizedText | null) || null,
        latestVersion: g.latestVersion,
        latestStatus: latest.status as DesignVersionStatus,
        confirmedVersion: confirmed?.version ?? null,
        latestRoles: [
          ...new Set(latest.files.map((f) => f.role as DesignFileRole)),
        ].sort(compareRole),
        hasRequestSourced: g.versions.some((v) => v.designRequestId != null),
        versionCount: g.versions.length,
        updatedAt: updated.toISOString(),
      });
    }
  }

  rows.sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.productName.localeCompare(b.productName, "ja"),
  );
  return { rows, truncated };
}

/** 詳細 (PD26) のヘッダに出す製品（品目 items.id）。未存在は null。 */
export async function fetchDesignFileItem(
  itemId: number,
): Promise<{ id: number; label: string } | null> {
  const r = await prisma.item.findFirst({
    where: { id: itemId, itemType: "PRODUCT" },
    select: { id: true, name: true, code: true },
  });
  return r ? { id: r.id, label: itemLabelOf(r) } : null;
}

/**
 * 版を載せられる受注元（CUSTOMER ロールを持つ取引先）。
 * 空のままなら汎用系列に積まれる。
 */
export async function fetchCustomerOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
    },
    select: { id: true, name: true },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    value: r.id,
    label: localized(r.name as LocalizedText | null) || r.id,
  }));
}

/**
 * `?request=DSG-…` の参照解決。
 *
 * クエリ文字列をそのままフォームへ渡さず、**実在を確かめてから**製品・受注元
 * ごとラベル付きで渡す（設計依頼 SA06 の new/page.tsx と同じ約束）。存在しない
 * 番号で製品を固定できてしまうと、そのまま登録して依頼と食い違う版ができる。
 */
export async function fetchDesignRequestContext(
  requestNumber: string,
): Promise<{
  id: string;
  requestNumber: string;
  /** 対象製品（品目, items.id）。 */
  itemId: number;
  productLabel: string;
  customerBpId: string | null;
  customerName: string | null;
} | null> {
  const r = await prisma.designRequest.findUnique({
    where: { requestNumber },
    select: {
      id: true,
      requestNumber: true,
      itemId: true,
      customerBpId: true,
      customerBp: { select: { name: true } },
      item: { select: { id: true, name: true, code: true } },
    },
  });
  // 製品の無い依頼（移行前の行）には版を紐づけられない — 系列が決まらない。
  if (!r || r.itemId == null || !r.item) return null;
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    itemId: r.itemId,
    productLabel: itemLabelOf(r.item),
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp?.name as LocalizedText | null) || null,
  };
}

/**
 * `?item=<items.id>` の参照解決（製品マスタ・一覧からの導線）。
 * ピッカーの値も items.id なので、そのまま option にする。
 */
export async function fetchProductItemOption(
  itemId: number,
): Promise<{ value: string; label: string } | null> {
  const r = await fetchDesignFileItem(itemId);
  return r ? { value: String(r.id), label: r.label } : null;
}
