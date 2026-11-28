/**
 * data.ts — server-side fetch/mapping for the 価格表 pages.
 *
 * 価格表番号（PRC-FFFF-NNNNN）は DB が払い出し、行は参照 doc_ref で引く。URL id は
 * 法人コード付きの番号（CKK~PRC-2026-00001 — lib/doc-number）。自然キー
 * (customer_bp_id, item_id, tool_item_id) は UNIQUE の識別用（工具は再研磨だけの
 * 任意の欄で、null を 1 つの値として数える — 部分 unique index 2 本）。注文種別ごとの価格は
 * price_list_variants（基準単価・期間・価格試算リンク + tiers/discounts）。
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  docIdOf,
  docIdOrNull,
  formatProductNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { calcTrialPricing, type TrialInput } from "@/lib/trial-pricing";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";

export const ENTRY_INCLUDE = {
  // 発行会社 — 価格表は会社ごとに別々（識別は 会社 × 顧客 × 品目 × 工具）。
  ownCompany: { select: { id: true, code: true, name: true } },
  customerBp: true,
  // 品目統合 第 2 段 C — 表示・突合はすべて品目側。旧 product リレーションは
  // 自然キー (customer_bp_id, product_id) を保つためだけに残っている。
  item: true,
  // 対象工具（再研磨の価格表だけが持つ任意の欄）。
  toolItem: { select: { id: true, code: true, name: true } },
  salesRep: { select: { id: true, displayName: true } },
  createdByUser: { select: { displayName: true } },
  variants: {
    orderBy: { orderType: "asc" as const },
    include: {
      tiers: {
        orderBy: [
          { sortOrder: "asc" as const },
          { minQuantity: "asc" as const },
        ],
      },
      discounts: { orderBy: { createdAt: "asc" as const } },
      // 価格試算元の番号は子の旧列ではなく、親の行（doc_ref）から読む。
      estimate: { select: { docRef: true } },
    },
  },
};

type EntryRow = NonNullable<Awaited<ReturnType<typeof findEntryRow>>>;

function findEntryRow(key: DocKey) {
  return prisma.priceListEntry.findUnique({
    where: { docRef: key.docRef },
    include: ENTRY_INCLUDE,
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 価格表の品目フィルタに出す選択肢 — **売り物だけ**（製品 + 再研磨品目、
 * 他社製品と素材は除く）。
 *
 * 一覧・詳細はこれまで 価格試算 の `fetchProductOptions`（`itemType: "PRODUCT"`
 * 固定）を借りていた。そのため**再研磨品目の価格表は一覧に出るのに、品目で
 * 絞り込もうとすると選択肢に無い**という食い違いが起きていた。作成フォームの
 * ピッカー（`searchPriceListItemOptions`）とは既に噛み合っていたので、
 * 読み出し側だけが取り残されていた形。
 *
 * 価格試算 (SA01) 側はこれまでどおり製品だけ — あちらは製品の原価を積む道具で、
 * 役務は対象外。だから共通の関数を広げず、価格表専用にここへ置く。
 */
export async function fetchPriceListItemOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.item.findMany({
    where: {
      itemType: { in: ["PRODUCT", "REGRIND"] },
      isExternalProduct: false,
      isActive: true,
    },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => {
    const code =
      r.code ?? formatProductNumber(r.yearMonth ?? null, r.seq ?? null);
    const nm = localized(r.name as LocalizedText | null);
    return { value: String(r.id), label: code ? `${nm} ${code}` : nm };
  });
}

/** 自社法人の表示名（名称が無ければコード）。 */
export function ownCompanyLabel(c: { code: string; name: unknown }): string {
  const name = localized(c.name as LocalizedText | null);
  return name && name !== "—" ? name : c.code;
}

export function mapEntry(r: EntryRow): PriceListEntry {
  return {
    entryId: docIdOf(r),
    legacyNumber: r.legacyNumber,
    ownCompanyId: r.ownCompanyId,
    ownCompanyCode: r.ownCompany.code,
    ownCompanyName: ownCompanyLabel(r.ownCompany),
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    itemId: String(r.itemId ?? ""),
    productName: (() => {
      // **品目の code をそのまま読む。** 以前は formatProductNumber で組み立て
      // ていたが、あれは接頭辞が PRD 固定なので、再研磨品目（RGD-YYYYMM-NNNN）
      // が価格表では PRD- と表示されていた。code 列が本物の採番結果を持つ。
      const code =
        r.item?.code ??
        formatProductNumber(r.item?.yearMonth ?? null, r.item?.seq ?? null);
      const nm = localized(r.item?.name as LocalizedText | null);
      return code ? `${nm} ${code}` : nm;
    })(),
    itemType: r.item?.itemType === "REGRIND" ? "REGRIND" : "PRODUCT",
    toolItemId: r.toolItemId != null ? String(r.toolItemId) : null,
    toolName: r.toolItem
      ? (() => {
          const nm = localized(r.toolItem.name as LocalizedText | null);
          return r.toolItem.code ? `${nm} ${r.toolItem.code}` : nm;
        })()
      : null,
    standardUnitPrice:
      r.item?.standardUnitPrice == null
        ? null
        : Number(r.item.standardUnitPrice),
    currency: r.currency,
    isActive: r.isActive,
    approvalStatus: r.approvalStatus,
    variants: r.variants.map((v) => {
      // id の姿（CKK~EST-…）— 価格試算へのリンクと Server Action の引数。
      const estimateNumber = docIdOrNull(v.estimate);
      return {
        id: v.id,
        orderType: v.orderType,
        baseUnitPrice: Number(v.baseUnitPrice),
        validFrom: iso(v.validFrom),
        validUntil: v.validUntil ? iso(v.validUntil) : null,
        isActive: v.isActive,
        tiers: v.tiers.map((t) => ({
          id: t.id,
          minQuantity: t.minQuantity,
          maxQuantity: t.maxQuantity,
          multiplier: Number(t.multiplier),
          priceOverride:
            t.priceOverride != null ? Number(t.priceOverride) : null,
        })),
        discounts: v.discounts.map((d) => ({
          id: d.id,
          label: d.label,
          discountType: d.discountType,
          value: Number(d.value),
          minQuantity: d.minQuantity,
          maxQuantity: d.maxQuantity,
          validFrom: iso(d.validFrom),
          validUntil: d.validUntil ? iso(d.validUntil) : null,
          isActive: d.isActive,
        })),
        estimateId: estimateNumber,
        estimateNumber,
      };
    }),
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdBy: r.createdByUser?.displayName ?? "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function fetchPriceEntries(): Promise<PriceListEntry[]> {
  // スコープ行フィルタ（OWN = 自分の作成分のみ。ALL は {} で従来通り全件）。
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.priceListEntry.findMany({
    where: ownWhere(
      authz.access,
      authz.userId,
      "createdBy",
    ) as Prisma.PriceListEntryWhereInput,
    include: ENTRY_INCLUDE,
    orderBy: [{ fiscalYear: "desc" }, { docSeq: "desc" }, { id: "desc" }],
  });
  return rows.map(mapEntry);
}

export async function fetchPriceEntry(
  key: DocKey,
): Promise<PriceListEntry | null> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return null;
  const row = await findEntryRow(key);
  if (!row) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
    return null;
  }
  return mapEntry(row);
}

/**
 * 相手方 — 同じ顧客 × 品目 × 工具を**別の発行会社**が持つ価格表（会社ごとの
 * 価格表の突き合わせ・同期用。components/sales/price-lists/company-sync.ts）。
 * 見えるのは読む権限のスコープ内の行だけ（OWN なら自分の作成分）。
 */
export async function fetchCounterpartEntries(
  entry: Pick<
    PriceListEntry,
    "ownCompanyId" | "customerId" | "itemId" | "toolItemId"
  >,
): Promise<PriceListEntry[]> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.priceListEntry.findMany({
    where: {
      AND: [
        ownWhere(
          authz.access,
          authz.userId,
          "createdBy",
        ) as Prisma.PriceListEntryWhereInput,
        {
          customerBpId: entry.customerId,
          itemId: Number(entry.itemId),
          toolItemId:
            entry.toolItemId == null ? null : Number(entry.toolItemId),
          ownCompanyId: { not: entry.ownCompanyId },
        },
      ],
    },
    include: ENTRY_INCLUDE,
    orderBy: { ownCompany: { code: "asc" } },
  });
  return rows.map(mapEntry);
}

/** この価格表（の tier）から作成された見積書 — 関連タブ用の集計。 */
export interface RelatedQuoteRow {
  quoteNumber: string;
  quantity: number;
  amount: number;
  status: "DRAFT" | "ISSUED";
  /** 表示状態（期限切れ）の判定に使う — components/sales/quotes/model.ts quoteDisplayStatus。 */
  validUntil: string | null;
  createdAt: string;
}

export async function fetchRelatedQuotes(
  key: DocKey,
): Promise<RelatedQuoteRow[]> {
  const items = await prisma.quoteItem.findMany({
    where: {
      priceListTier: {
        variant: { entry: { docRef: key.docRef } },
      },
    },
    include: { quote: true },
  });
  const byQuote = new Map<string, RelatedQuoteRow>();
  for (const it of items) {
    const number = docIdOf(it.quote);
    const agg = byQuote.get(number) ?? {
      quoteNumber: number,
      quantity: 0,
      amount: 0,
      status: it.quote.status,
      validUntil: it.quote.validUntil?.toISOString().slice(0, 10) ?? null,
      createdAt: it.quote.createdAt.toISOString(),
    };
    agg.quantity += it.quantity;
    agg.amount += Number(it.amount);
    byQuote.set(number, agg);
  }
  return [...byQuote.values()];
}

// ── 価格試算ソース（価格表作成時の基準単価候補） ─────────────────────────────────

/** 製品にリンクされた確定済み価格試算 — 基準単価ソースの選択肢。 */
export interface EstimateSource {
  /** 価格試算の id（法人コード + 番号 `CKK~EST-2026-00001`。URL id と同一）。 */
  number: string;
  name: string;
  customerName: string | null;
  /** 価格試算の見積単価（最小ロットの estimateUnitPrice）。 */
  unitPrice: number;
  updatedAt: string;
}

/** result スナップショット（無ければ input から再計算）→ 見積単価。 */
function estimateUnitPriceOf(
  result: unknown,
  input: TrialInput,
  settings: Awaited<ReturnType<typeof getTrialPricingSettings>>,
): number {
  const lots =
    result && typeof result === "object"
      ? (result as { lots?: { estimateUnitPrice?: number }[] }).lots
      : undefined;
  const snap = lots?.[0]?.estimateUnitPrice;
  if (typeof snap === "number") return snap;
  return (
    calcTrialPricing(input, toTrialPricingOptions(settings)).lots[0]
      ?.estimateUnitPrice ?? 0
  );
}

/**
 * 価格試算の id → 見積単価（基準単価のロック値）。編集フォームで既存バリアントの
 * 価格試算リンクごとに使う。
 */
export async function fetchEstimateBases(
  numbers: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(numbers)];
  if (unique.length === 0) return {};
  const settings = await getTrialPricingSettings();
  const bases: Record<string, number> = {};
  for (const number of unique) {
    const key = parseDocKey(number, "EST");
    if (!key) continue;
    const row = await prisma.estimate.findUnique({
      where: { docRef: key.docRef },
    });
    if (!row) continue;
    bases[number] = estimateUnitPriceOf(
      row.result,
      row.input as unknown as TrialInput,
      settings,
    );
  }
  return bases;
}

/**
 * 製品にリンクされた CONFIRMED の価格試算（価格ソース候補）。REGISTERED も含める
 * （既に他の価格表で使用済みでも、同じ価格試算を別顧客のソースにできる）。
 * `itemId` は品目 id（items.id）— 価格試算も価格表も同じ id 空間。
 */
export async function fetchEstimateSourcesForProduct(
  itemId: number,
): Promise<EstimateSource[]> {
  const [settings, rows] = await Promise.all([
    getTrialPricingSettings(),
    prisma.estimate.findMany({
      // 原価試算（kind = COST）は売価を持たないので候補に出さない
      // （保存側の resolveEstimateSource でも拒否する）。
      where: {
        itemId,
        kind: "PRICE",
        status: { in: ["CONFIRMED", "REGISTERED"] },
      },
      include: { customerBp: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return rows.map((r) => ({
    number: docIdOf(r),
    name: r.name,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    unitPrice: estimateUnitPriceOf(
      r.result,
      r.input as unknown as TrialInput,
      settings,
    ),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
