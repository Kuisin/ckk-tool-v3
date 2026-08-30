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

import type {
  DesignFileRole,
  DesignFileSeriesRow,
  ProductDesignFile,
} from "@/components/production/design-files/model";
import { prisma } from "@/lib/db";
import { groupBySeries, resolveSeriesCustomer } from "@/lib/design-files-core";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

/**
 * 一覧の取得上限。系列ではなく **版** の行数に効く点に注意 — 系列は版を
 * 束ねた結果なので、ここで切ると系列そのものが落ちる。
 */
const LIST_FETCH_CAP = 2000;

/** 製品ラベル: 名称 + 製品コード（レガシーはコード未採番 → 名称のみ）。 */
function productLabelOf(p: {
  id: number;
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const name = localized(p.name as LocalizedText | null) || `製品 #${p.id}`;
  const code = formatProductNumber(p.yearMonth, p.seq);
  return code ? `${name} ${code}` : name;
}

/**
 * 製品の設計図（版一覧・新しい版から）。製品詳細の「設計図」節。
 *
 * 「最新」は is_latest が立っている行。製品側に design_file_id 列は無い。
 */
export async function fetchDesignFilesForProduct(
  productId: number,
): Promise<ProductDesignFile[]> {
  const rows = await prisma.designFile.findMany({
    where: { productId },
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
    usedByWorkOrder: f._count.workOrders > 0,
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
  productId: number,
  customerBpId: string | null = null,
): Promise<ProductDesignFile | null> {
  const rows = await prisma.designFile.findMany({
    where: {
      productId,
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
  const files = await prisma.designFile.findMany({
    include: {
      file: { select: { filename: true, mimeType: true } },
      designRequest: { select: { requestNumber: true } },
      customerBp: { select: { name: true } },
      product: { select: { id: true, name: true, yearMonth: true, seq: true } },
      _count: { select: { workOrders: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: LIST_FETCH_CAP + 1,
  });
  const truncated = files.length > LIST_FETCH_CAP;
  const capped = truncated ? files.slice(0, LIST_FETCH_CAP) : files;

  // 製品ごとに分けてから系列へ落とす。groupBySeries は 1 製品ぶんを前提に
  // した関数なので、製品をまたいで渡すと別製品の同じ受注元が 1 系列になる。
  const byProduct = new Map<number, typeof capped>();
  for (const f of capped) {
    if (f.productId == null) continue; // 製品なしの版は系列を作れない
    const list = byProduct.get(f.productId) ?? [];
    list.push(f);
    byProduct.set(f.productId, list);
  }

  const rows: DesignFileSeriesRow[] = [];
  for (const [productId, list] of byProduct) {
    const product = list.find((f) => f.product)?.product;
    const productLabel = product
      ? productLabelOf(product)
      : `製品 #${productId}`;
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
        key: `${productId}:${g.customerBpId ?? ""}`,
        productId,
        productLabel,
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
      a.productLabel.localeCompare(b.productLabel, "ja"),
  );
  return { rows, truncated };
}

/** 詳細 (PD26) のヘッダに出す製品。未存在は null。 */
export async function fetchDesignFileProduct(
  productId: number,
): Promise<{ id: number; label: string } | null> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, yearMonth: true, seq: true },
  });
  return p ? { id: p.id, label: productLabelOf(p) } : null;
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
  productId: number;
  productLabel: string;
  customerBpId: string | null;
  customerName: string | null;
} | null> {
  const r = await prisma.designRequest.findUnique({
    where: { requestNumber },
    select: {
      id: true,
      requestNumber: true,
      productId: true,
      customerBpId: true,
      customerBp: { select: { name: true } },
      product: { select: { id: true, name: true, yearMonth: true, seq: true } },
    },
  });
  // 製品の無い依頼（移行前の行）には版を紐づけられない — 系列が決まらない。
  if (!r || r.productId == null || !r.product) return null;
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    productId: r.productId,
    productLabel: productLabelOf(r.product),
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp?.name as LocalizedText | null) || null,
  };
}

/** `?product=` の参照解決（製品マスタ・一覧からの導線）。 */
export async function fetchProductOption(
  productId: number,
): Promise<{ value: string; label: string } | null> {
  const p = await fetchDesignFileProduct(productId);
  return p ? { value: String(p.id), label: p.label } : null;
}
