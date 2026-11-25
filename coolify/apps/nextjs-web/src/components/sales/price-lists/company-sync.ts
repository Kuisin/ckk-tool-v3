/**
 * company-sync.ts — 会社ごとの価格表を突き合わせる pure 関数（client-safe）。
 *
 * 価格表は**発行会社ごとに別々**に持つ（識別は 発行会社 × 顧客 × 品目 × 工具）。
 * 同じ顧客 × 品目（× 工具）の価格表を別の会社も持っているとき、その 2 本を
 * 「相手方（counterpart）」と呼ぶ。この画面群がやることは 3 つ:
 *
 *   1. 価格の解決は**書類の発行会社の価格表だけ**を引く（`entriesForCompany`）。
 *      他社の価格表へ落ちることはない — 落ちると、発行していない会社の値段が
 *      書類に載る。
 *   2. 作成時に相手方があれば「他社の価格表からコピー」を勧める。
 *   3. 詳細・一覧で相手方と内容が同じか（`comparePriceContent`）を出し、
 *      違えば「〇〇社の内容で同期」できる（`syncVariantsFrom`）。
 *
 * **比べるのは価格の中身だけ** — 注文種別ごとの 基準単価・有効期間・状態、
 * 数量段階（範囲・倍率・上書き単価）、値引きルール。id・番号・作成/更新日時・
 * 発行会社・営業担当・価格試算リンク（どこから来た値かという出どころで、値では
 * ない）は見ない。会社が違えば番号も id も必ず違うので、それを数えると永遠に
 * 「差分あり」になる。
 */

import type {
  PriceDiscount,
  PriceListEntry,
  PriceTier,
  PriceVariant,
} from "./model";

// ── 1. 解決は書類の発行会社の価格表だけ ────────────────────────────────────────

/**
 * 発行会社 `ownCompanyId` の価格表だけに絞る。`null` は「会社が分からない」—
 * そのときは**何も引かない**（どの会社の値段か分からない価格を書類に載せない）。
 */
export function entriesForCompany<
  T extends Pick<PriceListEntry, "ownCompanyId">,
>(entries: readonly T[], ownCompanyId: number | null | undefined): T[] {
  if (ownCompanyId == null) return [];
  return entries.filter((e) => e.ownCompanyId === ownCompanyId);
}

// ── 2. 相手方（同じ顧客 × 品目 × 工具・別の会社） ─────────────────────────────

/** 価格表の識別のうち、会社を除いた部分。 */
export interface CounterpartKey {
  customerId: string;
  itemId: string;
  toolItemId: string | null;
}

/** 同じ顧客 × 品目 × 工具か（会社は見ない）。 */
export function sameCounterpartKey(a: CounterpartKey, b: CounterpartKey) {
  return (
    a.customerId === b.customerId &&
    a.itemId === b.itemId &&
    (a.toolItemId ?? null) === (b.toolItemId ?? null)
  );
}

/** `entry` の相手方 — 同じ顧客 × 品目 × 工具で、発行会社が違う価格表。 */
export function counterpartsOf<
  T extends CounterpartKey & { ownCompanyId: number; entryId: string },
>(
  entry: CounterpartKey & { ownCompanyId: number; entryId: string },
  entries: readonly T[],
): T[] {
  return entries.filter(
    (e) =>
      e.entryId !== entry.entryId &&
      e.ownCompanyId !== entry.ownCompanyId &&
      sameCounterpartKey(e, entry),
  );
}

// ── 3. 中身の比較 ─────────────────────────────────────────────────────────────

/** 比較する中身だけを取り出した形（並びも正規化済み）。 */
export interface TierContent {
  minQuantity: number;
  maxQuantity: number | null;
  multiplier: number;
  priceOverride: number | null;
}
export interface DiscountContent {
  label: string;
  discountType: "RATE" | "AMOUNT";
  value: number;
  minQuantity: number;
  maxQuantity: number | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
}
interface VariantContent {
  orderType: string;
  baseUnitPrice: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  tiers: TierContent[];
  discounts: DiscountContent[];
}

const tierContent = (t: PriceTier): TierContent => ({
  minQuantity: t.minQuantity,
  maxQuantity: t.maxQuantity,
  multiplier: t.multiplier,
  priceOverride: t.priceOverride,
});

const discountContent = (d: PriceDiscount): DiscountContent => ({
  label: d.label,
  discountType: d.discountType,
  value: d.value,
  minQuantity: d.minQuantity,
  maxQuantity: d.maxQuantity,
  validFrom: d.validFrom,
  validUntil: d.validUntil,
  isActive: d.isActive,
});

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function discountOrder(a: DiscountContent, b: DiscountContent): number {
  return (
    byString(a.label, b.label) ||
    byString(a.validFrom, b.validFrom) ||
    a.minQuantity - b.minQuantity ||
    byString(a.discountType, b.discountType) ||
    a.value - b.value
  );
}

function variantContent(v: PriceVariant): VariantContent {
  return {
    orderType: v.orderType,
    baseUnitPrice: v.baseUnitPrice,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
    isActive: v.isActive,
    tiers: v.tiers
      .map(tierContent)
      .sort((a, b) => a.minQuantity - b.minQuantity),
    discounts: v.discounts.map(discountContent).sort(discountOrder),
  };
}

/** 差分 1 件。`here` = この価格表、`there` = 相手方。 */
export type PriceContentDiff =
  /** 注文種別がどちらかにしか無い。 */
  | {
      kind: "variant";
      orderType: string;
      here: boolean;
      there: boolean;
    }
  /** 注文種別の値（基準単価・有効期間・状態）。 */
  | {
      kind: "variantField";
      orderType: string;
      field: "baseUnitPrice" | "validFrom" | "validUntil" | "isActive";
      here: number | string | boolean | null;
      there: number | string | boolean | null;
    }
  /** 数量段階（最小数量の昇順で n 行目）。行が片方に無ければ null。 */
  | {
      kind: "tier";
      orderType: string;
      index: number;
      here: TierContent | null;
      there: TierContent | null;
    }
  /** 値引きルール（名称・開始日の順で n 件目）。片方に無ければ null。 */
  | {
      kind: "discount";
      orderType: string;
      index: number;
      here: DiscountContent | null;
      there: DiscountContent | null;
    };

const VARIANT_FIELDS = [
  "baseUnitPrice",
  "validFrom",
  "validUntil",
  "isActive",
] as const;

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowDiffs<T>(
  here: readonly T[],
  there: readonly T[],
  make: (index: number, h: T | null, t: T | null) => PriceContentDiff,
): PriceContentDiff[] {
  const out: PriceContentDiff[] = [];
  const n = Math.max(here.length, there.length);
  for (let i = 0; i < n; i++) {
    const h = here[i] ?? null;
    const t = there[i] ?? null;
    if (!sameJson(h, t)) out.push(make(i, h, t));
  }
  return out;
}

/**
 * 2 本の価格表の中身の差分（空 = 同じ）。注文種別の昇順、種別の中は
 * 値 → 数量段階 → 値引きの順に並ぶ。
 */
export function comparePriceContent(
  here: Pick<PriceListEntry, "variants">,
  there: Pick<PriceListEntry, "variants">,
): PriceContentDiff[] {
  const h = new Map(here.variants.map((v) => [v.orderType, variantContent(v)]));
  const t = new Map(
    there.variants.map((v) => [v.orderType, variantContent(v)]),
  );
  const types = [...new Set([...h.keys(), ...t.keys()])].sort(byString);
  const out: PriceContentDiff[] = [];
  for (const orderType of types) {
    const hv = h.get(orderType);
    const tv = t.get(orderType);
    if (!(hv && tv)) {
      out.push({ kind: "variant", orderType, here: !!hv, there: !!tv });
      continue;
    }
    for (const field of VARIANT_FIELDS) {
      if (hv[field] !== tv[field]) {
        out.push({
          kind: "variantField",
          orderType,
          field,
          here: hv[field],
          there: tv[field],
        });
      }
    }
    out.push(
      ...rowDiffs(hv.tiers, tv.tiers, (index, a, b) => ({
        kind: "tier",
        orderType,
        index,
        here: a,
        there: b,
      })),
      ...rowDiffs(hv.discounts, tv.discounts, (index, a, b) => ({
        kind: "discount",
        orderType,
        index,
        here: a,
        there: b,
      })),
    );
  }
  return out;
}

/** 相手方 1 本との突き合わせ結果。 */
export interface CounterpartStatus {
  entryId: string;
  ownCompanyId: number;
  ownCompanyCode: string;
  ownCompanyName: string;
  /** true = 中身が同じ。 */
  same: boolean;
  diffs: PriceContentDiff[];
}

/** `entry` と、`entries` に含まれる相手方全部の突き合わせ（会社コード順）。 */
export function counterpartStatuses(
  entry: PriceListEntry,
  entries: readonly PriceListEntry[],
): CounterpartStatus[] {
  return counterpartsOf(entry, entries)
    .map((c) => {
      const diffs = comparePriceContent(entry, c);
      return {
        entryId: c.entryId,
        ownCompanyId: c.ownCompanyId,
        ownCompanyCode: c.ownCompanyCode,
        ownCompanyName: c.ownCompanyName,
        same: diffs.length === 0,
        diffs,
      };
    })
    .sort((a, b) => byString(a.ownCompanyCode, b.ownCompanyCode));
}

/**
 * 一覧の「他社との差分」列。相手方が無ければ null、1 本でも違えば "diff"、
 * 全部同じなら "same"。
 */
export function companySyncState(
  entry: PriceListEntry,
  entries: readonly PriceListEntry[],
): "same" | "diff" | null {
  const statuses = counterpartStatuses(entry, entries);
  if (statuses.length === 0) return null;
  return statuses.every((s) => s.same) ? "same" : "diff";
}

// ── 同期・コピーの中身 ────────────────────────────────────────────────────────

/** 同期・コピーで書き込むバリアント 1 件（保存 Action の入力と同じ形）。 */
export interface SyncVariantInput {
  /** 残す既存バリアントの id（同じ注文種別があれば）。新規は null。 */
  id: string | null;
  orderType: string;
  baseUnitPrice: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  /**
   * 価格試算リンク。**新しく作るバリアントだけ**相手方のリンクを引き継ぐ
   * （既存バリアントのリンクは保存側が変えない — 価格試算は出どころの記録）。
   */
  estimateNumber: string | null;
  tiers: {
    /** 残す既存段階の id（位置で対応させる）。新規は null。 */
    id: string | null;
    minQuantity: number;
    maxQuantity: number | null;
    multiplier: number;
    priceOverride: number | null;
  }[];
  discounts: DiscountContent[];
}

/**
 * `source`（相手方）の中身を `target` に書き込むためのバリアント一式。
 *
 * 同じ注文種別のバリアントは id を残し、数量段階も**位置で**既存の id を
 * 使い回す — 段階は見積明細（quote_items.price_list_tier_id）から指されて
 * いるので、消して作り直すと過去の見積書の「適用段階」が消える
 * （保存 Action の差分更新と同じ理由）。`target` に無い種別は新規、
 * `source` に無い種別は落ちる（= 削除）。`target` = null はコピー作成。
 */
export function syncVariantsFrom(
  target: Pick<PriceListEntry, "variants"> | null,
  source: Pick<PriceListEntry, "variants">,
): SyncVariantInput[] {
  const existing = new Map(
    (target?.variants ?? []).map((v) => [v.orderType, v]),
  );
  return source.variants.map((sv) => {
    const tv = existing.get(sv.orderType);
    const tierIds = tv
      ? [...tv.tiers]
          .sort((a, b) => a.minQuantity - b.minQuantity)
          .map((t) => t.id)
      : [];
    const content = variantContent(sv);
    return {
      id: tv?.id ?? null,
      orderType: sv.orderType,
      baseUnitPrice: content.baseUnitPrice,
      validFrom: content.validFrom,
      validUntil: content.validUntil,
      isActive: content.isActive,
      estimateNumber: tv ? null : sv.estimateNumber,
      tiers: content.tiers.map((t, i) => ({ id: tierIds[i] ?? null, ...t })),
      discounts: content.discounts,
    };
  });
}
