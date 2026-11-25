"use server";

/**
 * Server Actions — 価格表 (sales.price_list_entries + variants + tiers +
 * discounts).
 *
 * 価格表番号（PRC-FFFF-NNNNN）は DB が払い出し、行は参照 doc_ref で引く。URL id と
 * Server Action の引数は法人コード付きの番号（CKK~PRC-2026-00001）。自然キー（顧客, 製品）は UNIQUE として保持し、
 * 識別（重複防止）にのみ使う。注文種別ごとの価格は price_list_variants で、
 * tiers/discounts は variant_id でぶら下がる。
 *
 * 作成は顧客×製品から行い、製品にリンクされた確定済み価格試算をバリアントの
 * 基準単価ソースに選択できる（初回使用時に価格試算を REGISTERED へロック）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  sameCounterpartKey,
  syncVariantsFrom,
} from "@/components/sales/price-lists/company-sync";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { requiresEndDate } from "@/components/sales/price-lists/model";
import { actOnCurrentStep } from "@/lib/approvals";
import { recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { resolveIssuingCompany } from "@/lib/doc-company";
import { type DocKey, docIdOf, docNo, parseDocKey } from "@/lib/doc-number";
import { priceListItemError } from "@/lib/sales-item-guard";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { syncPriceEntryApproval } from "./approval";
import {
  type EstimateSource,
  fetchEstimateSourcesForProduct,
  fetchPriceEntry,
} from "./data";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const BASE_PATH = "/sales/price-lists";

/**
 * 対象エントリ（複数可）がスコープ内か（OWN 行チェック）。ALL は素通し。
 * 不存在キーは true — 既存の not-found 系エラー処理に委ねる。
 */
async function entriesInScope(
  access: Access,
  userId: string,
  keys: DocKey[],
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const rows = await prisma.priceListEntry.findMany({
    where: { docRef: { in: keys.map((k) => k.docRef) } },
    select: { createdBy: true },
  });
  return rows.every((r) =>
    rowInScope(access, { createdBy: r.createdBy }, userId),
  );
}

const orderTypeSchema = z.enum([
  "PRODUCTION",
  "TEST",
  "SAMPLE",
  "REGRIND",
  "OTHER",
]);

/**
 * 自然キー（新規作成・コピー先の識別に使用）— 顧客 × 品目 × 対象工具（任意）。
 *
 * 画面が選ぶのは**品目**（items.id、`itemType: "PRODUCT"`）。
 * DB の UNIQUE は (customer_bp_id, product_id) のままなので、保存の直前に
 * 品目 → products.id を橋渡しして両方の列を埋める（品目統合 第 2 段 C —
 * 価格表の識別は作成後不変という約束があり、鍵の差し替えは別の判断）。
 */
function identitySchema(tr: Tr) {
  return z.object({
    customerBpId: z
      .string()
      .min(1, tr("sales.orderAcceptances.selectACustomer")),
    // UI からは文字列（Select 値）で届く — DB は内部 id（int）
    itemId: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .pipe(z.number().int().min(1)),
    /**
     * 対象工具（任意・再研磨の品目だけ）。null / 空 = 工具を問わない価格表。
     * 識別の一部 — 同じ顧客 × 役務に、工具なしの 1 本と工具ごとの複数本が並ぶ。
     */
    toolItemId: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v) => (v == null || v === "" ? null : Number(v)))
      .pipe(z.number().int().min(1).nullable()),
  });
}

const tierSchema = z.object({
  /**
   * price_list_tiers.id — 保存済みの段階（編集フォームが送る）。null / 省略 =
   * 新規。更新時は id で突き合わせて **行を残す** — quote_items.price_list_tier_id
   * が参照しているので、消して作り直すと過去の見積書の適用段階が全部 null に
   * なる（ON DELETE SET NULL）。
   */
  id: z.string().nullable().optional(),
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  multiplier: z.number().min(0.01),
  priceOverride: z.number().min(0).nullable(),
});

/**
 * 値引きルール 1 件（中身だけ）。**他社の価格表からのコピー・同期でだけ**送る —
 * 通常の編集フォームは値引きを持たず（値引きは詳細画面のモーダルで 1 件ずつ）、
 * 送らなければ既存の値引きには触らない。
 */
const discountContentSchema = z.object({
  label: z.string().min(1),
  discountType: z.enum(["RATE", "AMOUNT"]),
  value: z.number().gt(0),
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  validFrom: z.string().min(1),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
});

function discountData(d: z.infer<typeof discountContentSchema>) {
  return {
    label: d.label,
    discountType: d.discountType,
    value: d.value,
    minQuantity: d.minQuantity,
    maxQuantity: d.maxQuantity,
    validFrom: new Date(d.validFrom),
    validUntil: d.validUntil ? new Date(d.validUntil) : null,
    isActive: d.isActive,
  };
}

function variantSchema(tr: Tr) {
  return z.object({
    /** price_list_variants.id — null = 新規バリアント。 */
    id: z.string().nullable(),
    orderType: orderTypeSchema,
    baseUnitPrice: z.number().min(0),
    validFrom: z.string().min(1, tr("sales.priceLists.selectAStartDate")),
    validUntil: z.string().nullable(),
    isActive: z.boolean(),
    /** 基準単価ソースの価格試算の id（手動設定は null。新規バリアントのみ有効）。 */
    estimateNumber: z.string().nullable(),
    tiers: z
      .array(tierSchema)
      .min(1, tr("sales.priceListTypeForm.addAtLeastOneTier")),
    /**
     * 値引きルール一式（任意）。**送ったときだけ**このバリアントの値引きを
     * まるごと置き換える（他社の価格表からのコピー・同期）。省略 = 触らない。
     */
    discounts: z.array(discountContentSchema).optional(),
  });
}

export type PriceVariantInput = z.input<ReturnType<typeof variantSchema>>;

/** クライアントから受け取る自然キー（itemId は文字列でも可）。 */
export type EntryIdentityPayload = z.input<ReturnType<typeof identitySchema>>;

function keyOf(entryNumber: string): DocKey | null {
  return parseDocKey(entryNumber, "PRC");
}

function whereKey(key: DocKey) {
  return { docRef: key.docRef };
}

function variantWhere(key: DocKey) {
  return { entry: { docRef: key.docRef } };
}

function revalidate(entryNumber?: string) {
  revalidatePath(BASE_PATH);
  if (entryNumber) {
    revalidatePath(`${BASE_PATH}/${entryNumber}`);
    revalidatePath(`${BASE_PATH}/${entryNumber}/edit`);
  }
}

function parseNumbers(entryNumbers: string[]): DocKey[] | null {
  const keys: DocKey[] = [];
  for (const n of entryNumbers) {
    const key = keyOf(n);
    if (!key) return null;
    keys.push(key);
  }
  return keys;
}

/** バリアント配列の共通検証（種別重複・TEST/SAMPLE の終了日必須）。 */
function validateVariants(
  tr: Tr,
  variants: z.infer<ReturnType<typeof variantSchema>>[],
): string | null {
  const seen = new Set<string>();
  for (const v of variants) {
    if (seen.has(v.orderType))
      return tr("sales.priceLists.theSameOrderTypeAppearsTwice");
    seen.add(v.orderType);
    if (requiresEndDate(v.orderType) && !v.validUntil) {
      return tr("sales.priceListsActions.testSampleRequiresEndDate");
    }
  }
  return null;
}

/**
 * 基準単価ソースの価格試算を解決 — CONFIRMED / REGISTERED のみ許可。
 * 返り値の needsLock = 初回使用（CONFIRMED → REGISTERED へのロックが必要）。
 */
async function resolveEstimateSource(
  tr: Tr,
  estimateNumber: string,
  itemId: number,
): Promise<
  | { ok: true; key: DocKey; estimateId: string; needsLock: boolean }
  | { ok: false; error: string }
> {
  const key = parseDocKey(estimateNumber, "EST");
  if (!key)
    return {
      ok: false,
      error: tr("sales.priceListsActions.invalidEstimateNumber"),
    };
  const estimate = await prisma.estimate.findUnique({
    where: whereKey(key),
    select: { id: true, status: true, itemId: true, kind: true },
  });
  if (!estimate)
    return { ok: false, error: tr("sales.priceListsActions.estimateNotFound") };
  // 原価試算は見積単価を出さない — 基準単価のソースにはできない。
  if (estimate.kind === "COST") {
    return {
      ok: false,
      error: tr("sales.priceListsActions.costEstimateNotUsable"),
    };
  }
  if (estimate.status === "DRAFT") {
    return {
      ok: false,
      error: tr("sales.priceListsActions.onlyConfirmedEstimateUsable"),
    };
  }
  // 別製品にリンクされた価格試算は基準単価ソースにできない（製品未リンクは可）。
  if (estimate.itemId != null && estimate.itemId !== itemId) {
    return { ok: false, error: tr("sales.priceListsActions.estimateNotFound") };
  }
  return {
    ok: true,
    key,
    estimateId: estimate.id,
    needsLock: estimate.status === "CONFIRMED",
  };
}

function tierData(t: z.infer<typeof tierSchema>, sortOrder: number) {
  return {
    minQuantity: t.minQuantity,
    maxQuantity: t.maxQuantity,
    multiplier: t.multiplier,
    priceOverride: t.priceOverride,
    sortOrder,
  };
}

function tierCreates(tiers: z.infer<typeof tierSchema>[]) {
  return tiers.map((t, i) => tierData(t, i));
}

/**
 * 価格表作成フォーム用 — 製品にリンクされた価格試算（基準単価ソース候補）。
 * `itemId` は品目 id（items.id）。
 */
export async function fetchEstimateSources(
  itemId: string | number,
): Promise<ActionResult<EstimateSource[]>> {
  const tr = await getTranslations();
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return actionError(authz.error);
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) return actionOk([]);
  try {
    return actionOk(await fetchEstimateSourcesForProduct(id));
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.priceListsActions.fetchEstimateSourcesFailed"),
        tr,
      ),
    );
  }
}

/**
 * 価格表作成フォーム用 — 選んだ品目の種別。再研磨の品目のときだけ
 * 「対象工具」の欄を出すために読む（判定の正は保存側の priceListItemError）。
 */
export async function fetchPriceListItemType(
  itemId: string | number,
): Promise<"PRODUCT" | "REGRIND" | null> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return null;
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await prisma.item.findUnique({
    where: { id },
    select: { itemType: true },
  });
  if (row?.itemType === "REGRIND") return "REGRIND";
  if (row?.itemType === "PRODUCT") return "PRODUCT";
  return null;
}

// ── 新規作成（顧客×製品 + バリアント一式） ───────────────────────────────────

function createInputSchema(tr: Tr) {
  return z.object({
    identity: identitySchema(tr),
    /**
     * 発行会社（自社法人 id）。拠点を持たない書類なので作成フォームで決める。
     * 未指定は初期値（所属拠点の法人が 1 つならそれ、でなければ既定の法人）。
     * 選べる法人かどうかはサーバーが検証する（lib/doc-company-core.ts）。
     */
    ownCompanyId: z.number().int().positive().nullable().optional(),
    /** 営業担当 — 未指定なら顧客の主担当が入る（lib/sales-rep）。 */
    salesRepId: z.string().nullable().optional(),
    /**
     * 他社の価格表からコピーして作ったときの元（`TSP~PRC-…`）。監査に残すだけで、
     * 中身は variants が運ぶ（元の価格表は読み直さない — 画面で見た内容を保存する）。
     */
    copiedFromEntryId: z.string().nullable().optional(),
    variants: z
      .array(variantSchema(tr))
      .min(1, tr("sales.priceListTypeForm.addAtLeastOneOrderTypePrice")),
  });
}

export type PriceEntryCreateInput = z.input<
  ReturnType<typeof createInputSchema>
>;

/**
 * 価格表を作ってよい品目か（他社製品・素材は不可。再研磨の品目は再研磨の
 * バリアントだけ、製品に再研磨のバリアントは作らない）。判定は
 * `lib/sales-item-guard.ts` が唯一の定義元。
 */
async function entryItemError(
  tr: Tr,
  itemId: number,
  orderTypes: readonly string[],
  toolItemId: number | null = null,
): Promise<string | null> {
  return priceListItemError(itemId, orderTypes, tr, toolItemId);
}

/**
 * 保存結果に添える承認の様子（独自値の追加承認）。画面は依頼したことを
 * 知らせ、依頼に失敗したときは理由を出す（保存自体は成功している）。
 */
export interface PriceEntrySaveResult {
  entryId: string;
  approvalRequested: boolean;
  approvalError?: string;
}

export async function createPriceEntry(
  payload: PriceEntryCreateInput,
): Promise<ActionResult<PriceEntrySaveResult>> {
  const tr = await getTranslations();
  const parsed = createInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  const variantError = validateVariants(tr, v.variants);
  if (variantError) return actionError(variantError);
  const itemError = await entryItemError(
    tr,
    v.identity.itemId,
    v.variants.map((x) => x.orderType),
    v.identity.toolItemId,
  );
  if (itemError) return actionError(itemError);
  try {
    // 価格試算ソースを検証（初回使用の価格試算はロック対象として控える）。
    const locks: { number: string; key: DocKey }[] = [];
    // 価格試算の id（画面から来た値）→ 行の uuid（バリアントの estimate_id）。
    const estimateIds = new Map<string, string>();
    for (const variant of v.variants) {
      if (!variant.estimateNumber) continue;
      const source = await resolveEstimateSource(
        tr,
        variant.estimateNumber,
        v.identity.itemId,
      );
      if (!source.ok) return actionError(source.error);
      estimateIds.set(variant.estimateNumber, source.estimateId);
      if (source.needsLock) {
        locks.push({ number: variant.estimateNumber, key: source.key });
      }
    }
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.identity.customerBpId,
      null,
    );
    const issuing = await resolveIssuingCompany(authz.userId, v.ownCompanyId);
    if (!issuing.ok) {
      return actionError(tr("common.issuingCompanyNotAllowed"));
    }
    const company = issuing.data;
    // 番号は DB が払い出す（INSERT トリガー）— 作った行から読み戻す。
    const [created] = await prisma.$transaction([
      prisma.priceListEntry.create({
        data: {
          ...company,
          customerBpId: v.identity.customerBpId,
          itemId: v.identity.itemId,
          toolItemId: v.identity.toolItemId,
          salesRepId,
          createdBy: authz.userId,
          variants: {
            create: v.variants.map((variant) => {
              const estimateId = variant.estimateNumber
                ? estimateIds.get(variant.estimateNumber)
                : undefined;
              return {
                orderType: variant.orderType,
                baseUnitPrice: variant.baseUnitPrice,
                validFrom: new Date(variant.validFrom),
                validUntil: variant.validUntil
                  ? new Date(variant.validUntil)
                  : null,
                isActive: variant.isActive,
                estimateId: estimateId ?? null,
                tiers: { create: tierCreates(variant.tiers) },
                ...(variant.discounts?.length
                  ? {
                      discounts: {
                        create: variant.discounts.map(discountData),
                      },
                    }
                  : {}),
              };
            }),
          },
        },
        select: { docRef: true },
      }),
      ...locks.map((l) =>
        prisma.estimate.update({
          where: whereKey(l.key),
          data: { status: "REGISTERED", registeredAt: new Date() },
        }),
      ),
    ]);
    const key: DocKey = { docRef: created.docRef };
    const entryId = docIdOf(key);
    await recordAudit({
      action: "CREATE",
      tableName: "price_list_entries",
      recordId: entryId,
      after: {
        customerBpId: v.identity.customerBpId,
        itemId: v.identity.itemId,
        toolItemId: v.identity.toolItemId,
        ownCompanyId: company.ownCompanyId ?? null,
        copiedFrom: v.copiedFromEntryId ? docNo(v.copiedFromEntryId) : null,
        orderTypes: v.variants.map((x) => x.orderType),
        estimateSources: v.variants
          .map((x) => docNo(x.estimateNumber))
          .filter(Boolean),
      },
    });
    for (const l of locks) {
      await recordAudit({
        action: "UPDATE",
        tableName: "estimates",
        recordId: l.number,
        before: { status: "CONFIRMED" },
        after: { status: "REGISTERED", priceListEntry: docNo(entryId) },
      });
      revalidatePath(`/sales/trial-estimates/${l.number}`);
    }
    revalidatePath("/sales/trial-estimates");
    // 独自値の追加承認（価格試算から引き継いでいない価格があれば依頼する）。
    const approval = await syncPriceEntryApproval(key);
    revalidate(entryId);
    return actionOk({
      entryId,
      approvalRequested: approval.requested,
      approvalError: approval.error,
    });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    if (code === "P2002") {
      return actionError(tr("sales.priceListsActions.duplicateEntry"));
    }
    return actionError(
      prismaErrorMessage(e, tr("sales.priceListsActions.createFailed"), tr),
    );
  }
}

// ── entry update（状態 + バリアント一式の追加・変更・削除） ──────────────────

function updateInputSchema(tr: Tr) {
  return z.object({
    entryNumber: z.string().min(1),
    isActive: z.boolean(),
    /** 営業担当。顧客は作成後不変なので、ここは選ばれた値をそのまま保存する。 */
    salesRepId: z.string().nullable().optional(),
    variants: z
      .array(variantSchema(tr))
      .min(1, tr("sales.priceListTypeForm.addAtLeastOneOrderTypePrice")),
  });
}

export type PriceEntryUpdateInput = z.input<
  ReturnType<typeof updateInputSchema>
>;

export async function updatePriceEntry(
  payload: PriceEntryUpdateInput,
): Promise<ActionResult<PriceEntrySaveResult>> {
  const tr = await getTranslations();
  const parsed = updateInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const key = keyOf(v.entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  const variantError = validateVariants(tr, v.variants);
  if (variantError) return actionError(variantError);
  try {
    const entryItem = await prisma.priceListEntry.findUnique({
      where: whereKey(key),
      select: { itemId: true },
    });
    if (entryItem) {
      const itemError = await entryItemError(
        tr,
        entryItem.itemId,
        v.variants.map((x) => x.orderType),
      );
      if (itemError) return actionError(itemError);
    }
    const existing = await prisma.priceListVariant.findMany({
      where: variantWhere(key),
      select: { id: true, orderType: true },
    });
    const existingIds = new Set(existing.map((x) => x.id));
    const keptIds = new Set(
      v.variants.map((x) => x.id).filter((id): id is string => !!id),
    );
    for (const id of keptIds) {
      if (!existingIds.has(id))
        return actionError(tr("sales.priceListsActions.invalidVariant"));
    }
    const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

    // 既存バリアントの段階は id で差分を取る（残す / 直す / 消す / 足す）。
    // 送られてきた id はそのバリアントの段階でなければ弾く（別の価格表の
    // 段階を書き換えさせない）。
    const existingTiers = keptIds.size
      ? await prisma.priceListTier.findMany({
          where: { variantId: { in: [...keptIds] } },
          select: { id: true, variantId: true },
        })
      : [];
    const tierOwner = new Map(existingTiers.map((t) => [t.id, t.variantId]));
    const keptTierIds = new Set<string>();
    for (const variant of v.variants) {
      for (const t of variant.tiers) {
        if (!t.id) continue;
        if (!variant.id || tierOwner.get(t.id) !== variant.id)
          return actionError(tr("sales.priceListsActions.invalidTier"));
        keptTierIds.add(t.id);
      }
    }
    const removedTierIds = existingTiers
      .map((t) => t.id)
      .filter((id) => !keptTierIds.has(id));

    // 新規バリアントの価格試算ソースを検証（既存バリアントのリンクは不変）。
    // 価格試算はこの価格表の製品にリンクされたものだけ（別製品の単価を混ぜない）。
    const entry = await prisma.priceListEntry.findUnique({
      where: whereKey(key),
      select: { id: true, itemId: true },
    });
    if (!entry?.itemId)
      return actionError(tr("sales.priceListsActions.updateFailed"));
    const locks: { number: string; key: DocKey }[] = [];
    // 価格試算の id（画面から来た値）→ 行の uuid（バリアントの estimate_id）。
    const estimateIds = new Map<string, string>();
    for (const variant of v.variants) {
      if (variant.id || !variant.estimateNumber) continue;
      const source = await resolveEstimateSource(
        tr,
        variant.estimateNumber,
        entry.itemId,
      );
      if (!source.ok) return actionError(source.error);
      estimateIds.set(variant.estimateNumber, source.estimateId);
      if (source.needsLock) {
        locks.push({ number: variant.estimateNumber, key: source.key });
      }
    }

    await prisma.$transaction([
      prisma.priceListEntry.update({
        where: whereKey(key),
        data: {
          isActive: v.isActive,
          salesRepId: v.salesRepId?.trim() || null,
        },
      }),
      // 削除されたバリアント（値引き → tier → 本体の順）。
      ...(removedIds.length
        ? [
            prisma.priceListDiscount.deleteMany({
              where: { variantId: { in: removedIds } },
            }),
            prisma.priceListTier.deleteMany({
              where: { variantId: { in: removedIds } },
            }),
            prisma.priceListVariant.deleteMany({
              where: { id: { in: removedIds } },
            }),
          ]
        : []),
      // 既存バリアント: 値を更新し、段階は id で差分更新する。
      // 消して作り直すと quote_items.price_list_tier_id（ON DELETE SET NULL）が
      // 過去の見積書ぶん全部 null になり「適用価格表」が読めなくなる — 実際に
      // そうなっていた。残る id は update、消えた id だけ delete、id なしは create。
      ...(removedTierIds.length
        ? [
            prisma.priceListTier.deleteMany({
              where: { id: { in: removedTierIds } },
            }),
          ]
        : []),
      ...v.variants
        .filter((x): x is typeof x & { id: string } => !!x.id)
        .flatMap((variant) => [
          prisma.priceListVariant.update({
            where: { id: variant.id },
            data: {
              baseUnitPrice: variant.baseUnitPrice,
              validFrom: new Date(variant.validFrom),
              validUntil: variant.validUntil
                ? new Date(variant.validUntil)
                : null,
              isActive: variant.isActive,
              tiers: {
                create: variant.tiers
                  .map((t, i) => (t.id ? null : tierData(t, i)))
                  .filter((x) => x != null),
              },
            },
          }),
          ...variant.tiers.flatMap((t, i) =>
            t.id
              ? [
                  prisma.priceListTier.update({
                    where: { id: t.id },
                    data: tierData(t, i),
                  }),
                ]
              : [],
          ),
          // 値引き一式が送られたとき（他社の価格表との同期）だけ置き換える。
          // 値引きはどこからも参照されていないので、消して作り直してよい。
          ...(variant.discounts
            ? [
                prisma.priceListDiscount.deleteMany({
                  where: { variantId: variant.id },
                }),
                ...(variant.discounts.length
                  ? [
                      prisma.priceListDiscount.createMany({
                        data: variant.discounts.map((d) => ({
                          variantId: variant.id,
                          ...discountData(d),
                        })),
                      }),
                    ]
                  : []),
              ]
            : []),
        ]),
      // 新規バリアント
      ...v.variants
        .filter((x) => !x.id)
        .map((variant) => {
          const estimateId = variant.estimateNumber
            ? estimateIds.get(variant.estimateNumber)
            : undefined;
          return prisma.priceListVariant.create({
            data: {
              entryId: entry.id,
              orderType: variant.orderType,
              baseUnitPrice: variant.baseUnitPrice,
              validFrom: new Date(variant.validFrom),
              validUntil: variant.validUntil
                ? new Date(variant.validUntil)
                : null,
              isActive: variant.isActive,
              estimateId: estimateId ?? null,
              tiers: { create: tierCreates(variant.tiers) },
              ...(variant.discounts?.length
                ? { discounts: { create: variant.discounts.map(discountData) } }
                : {}),
            },
          });
        }),
      ...locks.map((l) =>
        prisma.estimate.update({
          where: whereKey(l.key),
          data: { status: "REGISTERED", registeredAt: new Date() },
        }),
      ),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: v.entryNumber,
      after: {
        isActive: v.isActive,
        orderTypes: v.variants.map((x) => x.orderType),
        removedVariants: removedIds.length,
      },
    });
    for (const l of locks) {
      await recordAudit({
        action: "UPDATE",
        tableName: "estimates",
        recordId: l.number,
        before: { status: "CONFIRMED" },
        after: { status: "REGISTERED", priceListEntry: docNo(v.entryNumber) },
      });
      revalidatePath(`/sales/trial-estimates/${l.number}`);
    }
    // 独自値が変わっていれば承認をやり直す（変わっていなければ今の承認のまま）。
    const approval = await syncPriceEntryApproval(key);
    revalidate(v.entryNumber);
    return actionOk({
      entryId: v.entryNumber,
      approvalRequested: approval.requested,
      approvalError: approval.error,
    });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.priceListsActions.updateFailed"), tr),
    );
  }
}

// ── 別の顧客・製品へコピー（新規エントリ作成） ───────────────────────────────

/**
 * 別の顧客・製品へコピー — source の全バリアント（基準単価・tiers）を新エントリ
 * へ複製する。価格試算リンクは引き継がない（手動エントリとして作成）。指定した
 * 有効期間を全バリアントに適用する。
 */
export async function copyPriceEntry(payload: {
  sourceEntryNumber: string;
  targetIdentity: EntryIdentityPayload;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult<PriceEntrySaveResult>> {
  const tr = await getTranslations();
  const authz = await checkPermission("price_list", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const sourceKey = keyOf(payload.sourceEntryNumber);
  if (!sourceKey)
    return actionError(tr("sales.priceListsActions.invalidSourceEntryNumber"));
  if (!(await entriesInScope(authz.access, authz.userId, [sourceKey]))) {
    return actionError(tr("common.scopeDenied"));
  }
  const source = await prisma.priceListEntry.findUnique({
    where: whereKey(sourceKey),
    include: { variants: { include: { tiers: true } } },
  });
  if (!source)
    return actionError(tr("sales.priceListsActions.sourceEntryNotFound"));
  // 対象工具は、コピー先が同じ品目（= 同じ研ぎ直しの役務）のときだけ引き継ぐ。
  // 別の品目へ移すなら工具の意味も変わるので、明示されない限り外す。
  const targetItemId = Number(payload.targetIdentity.itemId);
  const toolItemId =
    payload.targetIdentity.toolItemId !== undefined
      ? payload.targetIdentity.toolItemId
      : targetItemId === source.itemId
        ? source.toolItemId
        : null;
  return createPriceEntry({
    identity: { ...payload.targetIdentity, toolItemId },
    variants: source.variants.map((variant) => ({
      id: null,
      orderType: variant.orderType,
      baseUnitPrice: Number(variant.baseUnitPrice),
      validFrom: payload.validFrom,
      validUntil: payload.validUntil,
      isActive: true,
      estimateNumber: null,
      tiers: variant.tiers
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({
          minQuantity: t.minQuantity,
          maxQuantity: t.maxQuantity,
          multiplier: Number(t.multiplier),
          priceOverride:
            t.priceOverride != null ? Number(t.priceOverride) : null,
        })),
    })),
  });
}

/** 有効期間の変更 — バリアント単位（自然キーは不変 — 期間を付け替える）。 */
export async function changePriceEntryPeriod(payload: {
  entryNumber: string;
  variantId: string;
  validFrom: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const period = z
    .object({
      variantId: z
        .string()
        .min(1, tr("sales.priceListsActions.selectOrderType")),
      validFrom: z.string().min(1, tr("sales.priceLists.selectAStartDate")),
      validUntil: z.string().nullable(),
    })
    .safeParse(payload);
  if (!period.success) {
    return actionError(
      period.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const key = keyOf(payload.entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const variant = await prisma.priceListVariant.findUnique({
      where: { id: payload.variantId },
      select: { entry: { select: { docRef: true } }, orderType: true },
    });
    if (!variant || variant.entry.docRef !== key.docRef) {
      return actionError(tr("sales.priceListsActions.invalidVariant"));
    }
    if (requiresEndDate(variant.orderType) && !payload.validUntil) {
      return actionError(
        tr("sales.priceListsActions.testSampleRequiresEndDate"),
      );
    }
    await prisma.priceListVariant.update({
      where: { id: payload.variantId },
      data: {
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: payload.entryNumber,
      after: {
        orderType: variant.orderType,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
      },
    });
    revalidate(payload.entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.priceListsActions.periodChangeFailed"),
        tr,
      ),
    );
  }
}

// ── 状態・削除（一覧の一括操作にも使用） ─────────────────────────────────────

export async function setPriceEntriesActive(
  entryNumbers: string[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  if (entryNumbers.length === 0)
    return actionError(tr("common.noTargetSelected"));
  const keys = parseNumbers(entryNumbers);
  if (!keys)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, keys))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    await prisma.$transaction(
      keys.map((key) =>
        prisma.priceListEntry.update({
          where: whereKey(key),
          data: { isActive },
        }),
      ),
    );
    revalidate();
    for (const n of entryNumbers) {
      revalidate(n);
      await recordAudit({
        action: "UPDATE",
        tableName: "price_list_entries",
        recordId: n,
        after: { isActive },
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deletePriceEntries(
  entryNumbers: string[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  if (entryNumbers.length === 0)
    return actionError(tr("common.noTargetSelected"));
  const keys = parseNumbers(entryNumbers);
  if (!keys)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, keys))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    await prisma.$transaction(
      keys.flatMap((key) => [
        prisma.priceListDiscount.deleteMany({
          where: { variant: variantWhere(key) },
        }),
        prisma.priceListTier.deleteMany({
          where: { variant: variantWhere(key) },
        }),
        prisma.priceListVariant.deleteMany({ where: variantWhere(key) }),
        prisma.priceListEntry.delete({ where: whereKey(key) }),
      ]),
    );
    revalidate();
    for (const n of entryNumbers) {
      await recordAudit({
        action: "DELETE",
        tableName: "price_list_entries",
        recordId: n,
      });
    }
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.priceListsActions.deleteFailed"), tr),
    );
  }
}

// ── 値引きルール（バリアント単位） ───────────────────────────────────────────

function discountInputSchema(tr: Tr) {
  return z.object({
    entryNumber: z.string().min(1),
    variantId: z.string().min(1, tr("sales.priceListsActions.selectOrderType")),
    id: z.string().nullable(),
    label: z.string().min(1, tr("sales.discountRuleModal.enterAName")),
    discountType: z.enum(["RATE", "AMOUNT"]),
    value: z.number().gt(0, tr("sales.discountRuleModal.enterAtLeast1")),
    minQuantity: z.number().int().min(1),
    maxQuantity: z.number().int().nullable(),
    validFrom: z
      .string()
      .min(1, tr("master.approvalSettings.selectAStartDate")),
    validUntil: z.string().nullable(),
    isActive: z.boolean(),
  });
}

export type DiscountRuleInput = z.input<ReturnType<typeof discountInputSchema>>;

export async function saveDiscountRule(
  payload: DiscountRuleInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const parsed = discountInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const key = keyOf(v.entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  const data = {
    label: v.label,
    discountType: v.discountType,
    value: v.value,
    minQuantity: v.minQuantity,
    maxQuantity: v.maxQuantity,
    validFrom: new Date(v.validFrom),
    validUntil: v.validUntil ? new Date(v.validUntil) : null,
    isActive: v.isActive,
  };
  try {
    const variant = await prisma.priceListVariant.findUnique({
      where: { id: v.variantId },
      select: { entry: { select: { docRef: true } } },
    });
    if (!variant || variant.entry.docRef !== key.docRef) {
      return actionError(tr("sales.priceListsActions.invalidVariant"));
    }
    if (v.id) {
      // id だけで更新すると他の価格表の値引きルールを書き換えられる —
      // 検証済みのバリアントに属する行だけを対象にし、0 件なら失敗にする。
      const updated = await prisma.priceListDiscount.updateMany({
        where: { id: v.id, variantId: v.variantId },
        data,
      });
      if (updated.count === 0) {
        return actionError(
          tr("sales.priceListsActions.saveDiscountRuleFailed"),
        );
      }
    } else {
      await prisma.priceListDiscount.create({
        data: { variantId: v.variantId, ...data },
      });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: v.entryNumber,
      after: {
        discountRule: v.label,
        discountType: v.discountType,
        value: v.value,
        isActive: v.isActive,
      },
    });
    revalidate(v.entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.priceListsActions.saveDiscountRuleFailed"),
        tr,
      ),
    );
  }
}

export async function deleteDiscountRule(
  entryNumber: string,
  id: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    // id だけで消すと他の価格表の値引きルールを消せる — この価格表の
    // バリアントに属する行だけを対象にし、0 件なら失敗にする。
    const deleted = await prisma.priceListDiscount.deleteMany({
      where: { id, variant: variantWhere(key) },
    });
    if (deleted.count === 0) {
      return actionError(
        tr("sales.priceListsActions.deleteDiscountRuleFailed"),
      );
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: entryNumber,
      after: { discountRuleDeleted: true },
    });
    revalidate(entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.priceListsActions.deleteDiscountRuleFailed"),
        tr,
      ),
    );
  }
}

// ── 独自値の追加承認（承認設定 MS0B） ────────────────────────────────────────

/**
 * 承認依頼をもう一度出す — 差し戻された価格表を直さずに出し直すとき、または
 * 保存時に依頼が作れなかったとき。直して保存すれば同じことが起きる。
 */
export async function requestPriceEntryApproval(
  entryNumber: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const approval = await syncPriceEntryApproval(key);
    if (approval.error) return actionError(approval.error);
    if (approval.status === "NONE")
      return actionError(tr("sales.priceListsActions.noApprovalNeeded"));
    revalidate(entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.approvalRequestFailed"), tr),
    );
  }
}

/** 承認 — 全段通過で APPROVED（以後、価格の解決に使われる）。 */
export async function approvePriceEntry(
  entryNumber: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 承認グループ所属（本人 or 代理）は actOnCurrentStep が検証する。
  const authz = await checkApprovalDocAccess("price_list");
  if (!authz.ok) return actionError(authz.error);
  const key = keyOf(entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.priceListEntry.findUnique({
      where: whereKey(key),
      select: { approvalStatus: true },
    });
    if (!prior) return actionError(tr("sales.priceListsActions.notFound"));
    if (prior.approvalStatus !== "PENDING")
      return actionError(tr("sales.priceListsActions.notPendingApproval"));
    const acted = await actOnCurrentStep({
      targetType: "price_list_entries",
      targetId: entryNumber,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    // 途中の段は PENDING のまま進む。全段を通ってはじめて APPROVED。
    if (acted.flowCompleted) {
      await prisma.priceListEntry.update({
        where: whereKey(key),
        data: { approvalStatus: "APPROVED" },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "price_list_entries",
        recordId: entryNumber,
        before: { approvalStatus: "PENDING" },
        after: { approvalStatus: "APPROVED" },
      });
    }
    revalidate(entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し（理由必須）— 価格表は承認されるまで価格の解決に使われない。 */
export async function rejectPriceEntry(
  entryNumber: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("price_list");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const key = keyOf(entryNumber);
  if (!key)
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  if (!(await entriesInScope(authz.access, authz.userId, [key]))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.priceListEntry.findUnique({
      where: whereKey(key),
      select: { approvalStatus: true },
    });
    if (!prior) return actionError(tr("sales.priceListsActions.notFound"));
    if (prior.approvalStatus !== "PENDING")
      return actionError(tr("sales.priceListsActions.notPendingApproval"));
    const acted = await actOnCurrentStep({
      targetType: "price_list_entries",
      targetId: entryNumber,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok)
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    await prisma.priceListEntry.update({
      where: whereKey(key),
      data: { approvalStatus: "REJECTED" },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: entryNumber,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "REJECTED", rejectReason: trimmed },
    });
    revalidate(entryNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

// ── 他社の価格表（相手方）からのコピー・同期 ────────────────────────────────────

/**
 * 作成フォームの「他社の価格表からコピー」— 相手方 1 件の中身を読む。
 * 読む権限とスコープは詳細画面と同じ（fetchPriceEntry）。
 */
export async function fetchPriceEntryForCopy(
  entryNumber: string,
): Promise<PriceListEntry | null> {
  const key = keyOf(entryNumber);
  if (!key) return null;
  return fetchPriceEntry(key);
}

/**
 * 「〇〇社の内容で同期」— 相手方（同じ顧客 × 品目 × 工具の、別の発行会社の
 * 価格表）の中身（注文種別ごとの基準単価・有効期間・状態、数量段階、
 * 値引きルール）をこの価格表へ書き込む。
 *
 * **通常の保存（updatePriceEntry）を通す** — 段階の id の差分更新、価格試算の
 * 検証、独自値の追加承認（承認設定 MS0B）がそのまま効く。同期だからといって
 * 承認を素通りさせない。番号・発行会社・営業担当・状態（価格表全体の有効/無効）
 * はこの価格表のまま。
 */
export async function syncPriceEntryFromCounterpart(payload: {
  entryNumber: string;
  counterpartEntryNumber: string;
}): Promise<ActionResult<PriceEntrySaveResult>> {
  const tr = await getTranslations();
  const key = keyOf(payload.entryNumber);
  const sourceKey = keyOf(payload.counterpartEntryNumber);
  if (!(key && sourceKey))
    return actionError(tr("sales.priceListsActions.invalidEntryNumber"));
  const authz = await checkPermission("price_list", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await entriesInScope(authz.access, authz.userId, [key, sourceKey]))) {
    return actionError(tr("common.scopeDenied"));
  }
  const [target, source] = await Promise.all([
    fetchPriceEntry(key),
    fetchPriceEntry(sourceKey),
  ]);
  if (!(target && source))
    return actionError(tr("sales.priceListsActions.sourceEntryNotFound"));
  // 相手方であること — 同じ顧客 × 品目 × 工具で、発行会社が違う。
  if (
    !sameCounterpartKey(target, source) ||
    target.ownCompanyId === source.ownCompanyId
  ) {
    return actionError(tr("sales.priceListsActions.notACounterpart"));
  }
  const result = await updatePriceEntry({
    entryNumber: target.entryId,
    isActive: target.isActive,
    salesRepId: target.salesRepId,
    variants: syncVariantsFrom(target, source).map((v) => ({
      ...v,
      orderType: v.orderType as PriceVariantInput["orderType"],
    })),
  });
  if (result.ok) {
    await recordAudit({
      action: "UPDATE",
      tableName: "price_list_entries",
      recordId: target.entryId,
      after: {
        syncedFrom: docNo(source.entryId),
        syncedFromCompany: source.ownCompanyCode,
      },
    });
  }
  return result;
}
