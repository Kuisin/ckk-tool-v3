/**
 * data.ts — 設計図 (PD06) のサーバーサイド取得・マッピング。
 *
 * 版は **(製品 × 受注元)** ごとの系列で育つ。系列そのものはテーブルではなく
 * design_files を束ねた導出値なので、束ね方は `lib/design-files-core.ts` の
 * `groupBySeries` / `sameSeries` に寄せる（一覧・詳細・製品マスタが同じ
 * 並びになる唯一の理由）。
 *
 * ここは設計依頼 (SA06) の data.ts から図面ぶんを引き取ったもの。依頼を経ない
 * 版があるので、図面の取得が依頼の取得に相乗りしているのは筋が悪かった。
 */

import { getTranslations } from "next-intl/server";
import type {
  DesignFileRole,
  DesignFileSeriesRow,
  ProductDesignFile,
} from "@/components/production/design-files/model";
import { prisma } from "@/lib/db";
import {
  groupBySeries,
  resolveSeriesCustomer,
  usedVersionKeys,
  versionKey,
} from "@/lib/design-files-core";
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

/**
 * 製品の設計図（版一覧・新しい版から）。製品詳細の「設計図」節。
 *
 * 「最新」は is_latest が立っている行。製品マスタ側に design_file_id 列は無い。
 *
 * `itemId` は items.id（品目統合 第 3 段 — 製品マスタ MS04 も設計図 PD26 も
 * この id 空間で回る）。products.id を渡さないこと。
 */
export async function fetchDesignFilesForItem(
  itemId: number,
): Promise<ProductDesignFile[]> {
  const rows = await prisma.designFile.findMany({
    where: { itemId },
    include: {
      file: { select: { filename: true, mimeType: true } },
      designRequest: { select: { requestNumber: true } },
      customerBp: { select: { name: true } },
      // 指示書がこの版を指しているか = 編集・削除できるか。導出値なので
      // 列は持たない（ピン留めを外したら編集できるように戻るのが正しい）。
      _count: { select: { workOrders: true } },
    },
    orderBy: [{ version: "desc" }, { role: "asc" }],
    // 版は (製品 × 受注元) ごとに育つので、顧客が増えるほど行が増える。
    // 20 だと系列がいくつかあるだけで古い版が黙って消えるため広めに取る。
    take: 200,
  });
  // 使用中は**版**単位（同じ版のプレビュー・参考資料も一緒に凍る）—
  // 削除の Server Action と同じ規則（usedVersionKeys）。
  const used = usedVersionKeys(
    rows.map((f) => ({
      customerBpId: f.customerBpId,
      version: f.version,
      workOrderCount: f._count.workOrders,
    })),
  );
  return rows.map((f) => ({
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
    usedByWorkOrder: used.has(versionKey(f)),
    notes: f.notes,
    createdAt: f.createdAt.toISOString(),
  }));
}

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
  file: { filename: string; mimeType: string };
  designRequest: { requestNumber: string } | null;
  customerBp: { name: unknown } | null;
  _count: { workOrders: number };
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
    usedByWorkOrder: f._count.workOrders > 0,
    notes: f.notes,
    createdAt: f.createdAt.toISOString(),
  };
}

const DESIGN_FILE_INCLUDE = {
  file: { select: { filename: true, mimeType: true } },
  designRequest: { select: { requestNumber: true } },
  customerBp: { select: { name: true } },
  _count: { select: { workOrders: true } },
} as const;

/**
 * 指示書などに出す「いま何を見て作るか」の 1 件。
 *
 * **受注元で見る系列が変わる。** 顧客一致の系列を優先し、無ければ汎用へ落ちる
 * （他の顧客専用の系列へは決して落ちない — 落とすと B の指示書に A の図面が
 * 黙って出て、気づかないまま違う物を作る）。優先規則は
 * lib/design-files-core resolveSeriesCustomer が唯一の定義元。
 *
 * 役割の優先は PREVIEW → BLUEPRINT。3D プレビュー用に上げたファイルがあれば
 * それを見せ、無ければ図面データ（PDF 等）を見せる。
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
 * 上限に当たったぶんは黙って落とさず、呼び出し側へ `truncated` で返して
 * 画面に出す（「これで全部」に見えるのがいちばん困る）。
 */
export async function fetchDesignFileSeries(): Promise<{
  rows: DesignFileSeriesRow[];
  truncated: boolean;
}> {
  const tr = await getTranslations();
  const files = await prisma.designFile.findMany({
    include: {
      file: { select: { filename: true, mimeType: true } },
      designRequest: { select: { requestNumber: true } },
      customerBp: { select: { name: true } },
      item: { select: { id: true, name: true, code: true } },
      _count: { select: { workOrders: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: LIST_FETCH_CAP + 1,
  });
  const truncated = files.length > LIST_FETCH_CAP;
  const capped = truncated ? files.slice(0, LIST_FETCH_CAP) : files;

  // 品目ごとに分けてから系列へ落とす。groupBySeries は 1 品目ぶんを前提に
  // した関数なので、品目をまたいで渡すと別製品の同じ受注元が 1 系列になる。
  const byItem = new Map<number, typeof capped>();
  for (const f of capped) {
    if (f.itemId == null) continue; // 製品なしの版は系列を作れない
    const list = byItem.get(f.itemId) ?? [];
    list.push(f);
    byItem.set(f.itemId, list);
  }
  const rows: DesignFileSeriesRow[] = [];
  for (const [itemId, list] of byItem) {
    const item = list.find((f) => f.item)?.item;
    const parts = item
      ? { name: localized(item.name as LocalizedText | null), code: item.code }
      : {
          name: tr("shipping.deliveryNoteActions.productFallbackLabel", {
            id: itemId,
          }),
          code: null,
        };
    for (const g of groupBySeries(
      list.map((f) => ({
        id: f.id,
        version: f.version,
        isLatest: f.isLatest,
        role: f.role as DesignFileRole,
        customerBpId: f.customerBpId,
        designRequestId: f.designRequestId,
        createdAt: f.createdAt,
        customerName:
          localized(f.customerBp?.name as LocalizedText | null) || null,
      })),
    )) {
      const latest = g.files.filter((f) => f.version === g.latestVersion);
      rows.push({
        key: `${itemId}:${g.customerBpId ?? ""}`,
        itemId,
        productName: parts.name,
        productCode: parts.code,
        customerBpId: g.customerBpId,
        customerName: g.files.find((f) => f.customerName)?.customerName ?? null,
        latestVersion: g.latestVersion,
        latestRoles: latest.map((f) => f.role),
        hasRequestSourced: g.files.some((f) => f.designRequestId != null),
        versionCount: new Set(g.files.map((f) => f.version)).size,
        updatedAt: g.files
          .reduce(
            (max, f) => (f.createdAt > max ? f.createdAt : max),
            g.files[0].createdAt,
          )
          .toISOString(),
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
