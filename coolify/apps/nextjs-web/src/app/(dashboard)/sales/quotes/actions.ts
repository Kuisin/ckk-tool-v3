"use server";

/**
 * Server Actions — 見積書 (sales.quotes + quote_items).
 *
 * 番号（QOT-FFFF-NNNNN）は DB が払い出し、行は参照 doc_ref で引く。見積書は
 * 価格表からのみ価格を解決する — 明細の単価・値引きは保存時にもサーバー側で
 * 価格表から再解決してスナップショットする（クライアント表示値は信用しない）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isoDateJst } from "@/components/sales/price-lists/model";
import {
  type PriceMissReason,
  resolvePriceFromEntries,
} from "@/components/sales/quotes/model";
import { recordAudit } from "@/lib/audit";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { resolveIssuingCompany } from "@/lib/doc-company";
import { type DocKey, docIdOf, parseDocKey } from "@/lib/doc-number";
import { lineAmountYen, roundYen } from "@/lib/money";
import { planQuoteMail, sendQuoteMail } from "@/lib/quote-mail";
import { salesLineItemError } from "@/lib/sales-item-guard";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadStandardUnitPrices } from "@/lib/standard-price";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { resolveLineTax } from "@/lib/tax-rate";
import { fetchCompanyEntriesForCustomer } from "./data";

const BASE_PATH = "/sales/quotes";

/**
 * 明細解決（価格表なし）のエラーを識別するためのマーカー。メッセージは
 * 翻訳されるため、判定は `instanceof` で行う（文字列の前方一致には頼らない）。
 */
class LineItemResolveError extends Error {}

/**
 * 対象見積書がスコープ内か（OWN 行チェック）。ALL は素通し。
 * 不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function quoteInScope(
  access: Access,
  userId: string,
  key: DocKey,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.quote.findUnique({
    where: { docRef: key.docRef },
    select: { createdBy: true },
  });
  if (!row) return true;
  return rowInScope(access, { createdBy: row.createdBy }, userId);
}

function itemInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    /** 製品 — 値は品目 id（items.id、`itemType: "PRODUCT"`）。 */
    itemId: z.string().min(1, tr("common.selectAProduct")),
    orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "REGRIND", "OTHER"]),
    quantity: z.number().int().min(1, tr("sales.quoteActions.quantityMinOne")),
    deliveryDate: z.string().nullable(),
    notes: z.string().nullable(),
  });
}

function quoteInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    customerBpId: z
      .string()
      .min(1, tr("sales.orderAcceptances.selectACustomer")),
    customerBranchBpId: z.string().nullable(),
    // 営業担当 — 顧客の担当一覧（bp_sales_reps）から選ぶ。未指定で顧客が
    // 変わったときは主担当が既定で入る（lib/sales-rep resolveSalesRepId）。
    salesRepId: z.string().nullable().optional(),
    /**
     * 発行会社（自社法人 id）。拠点を持たない書類なので作成フォームで決める。
     * 未指定は初期値（所属拠点の法人が 1 つならそれ、でなければ既定の法人）。
     * 選べる法人かどうかはサーバーが検証する（lib/doc-company-core.ts）。
     */
    ownCompanyId: z.number().int().positive().nullable().optional(),
    validUntil: z.string().nullable(),
    notes: z.string(),
    items: z
      .array(itemInputSchema(tr))
      .min(1, tr("common.addAtLeastOneLineItem")),
  });
}

export type QuoteInput = z.infer<ReturnType<typeof quoteInputSchema>>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

/**
 * 価格表から引けなかった理由 → 利用者向けの文言。「価格表なし」の一言だと、
 * 価格表はあるのに数量段階が無いだけの行（数量を直せば通る）と、価格表そのものが
 * 無い行（価格試算から登録が要る）の区別がつかなかった。
 */
function lineResolveMessage(
  reason: PriceMissReason,
  line: number,
  quantity: number,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string {
  switch (reason) {
    case "no-tier":
      return tr("sales.quoteActions.noPriceListTier", { line, quantity });
    case "inactive":
      return tr("sales.quoteActions.priceListInactive", { line });
    case "expired":
      return tr("sales.quoteActions.priceListExpired", { line });
    case "unapproved":
      return tr("sales.quoteActions.priceListUnapproved", { line });
    default:
      return tr("sales.quoteActions.noPriceListEntry", { line });
  }
}

/** 顧客の課税区分（null =「製品に従う」）。 */
async function customerTaxCategoryIdOf(bpId: string): Promise<number | null> {
  const row = await prisma.bpCustomerAttrs.findUnique({
    where: { bpId },
    select: { taxCategoryId: true },
  });
  return row?.taxCategoryId ?? null;
}

/** 品目 id → 課税区分 id（未設定は map に載らない = 既定に従う）。 */
async function productTaxCategoryMap(
  itemIds: readonly number[],
): Promise<Map<number, number | null>> {
  if (itemIds.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: { id: { in: [...new Set(itemIds)] } },
    select: { id: true, taxCategoryId: true },
  });
  return new Map(rows.map((r) => [r.id, r.taxCategoryId]));
}

/**
 * 明細の単価・値引きを価格表からサーバー側で再解決する。
 * 未解決の行（価格表なし）はエラー — 見積書は価格表からのみ作成できる。
 * 値引きは解決側（resolvePriceFromEntries）が明細金額を上限に丸めるので、
 * discount_amount が unit_price × quantity を超えて保存されることはない。
 */
async function resolveItems(
  v: QuoteInput,
  tr: Awaited<ReturnType<typeof getTranslations>>,
  /** 見積書の発行会社 — その会社の価格表だけを引く。null = 既定の法人。 */
  ownCompanyId: number | null | undefined,
) {
  const entries = await fetchCompanyEntriesForCustomer(
    v.customerBpId,
    ownCompanyId,
  );
  // 税は**行ごと**（製品ごとに課税区分が違い得る）。見積書は印刷して外に出す書類
  // なので、単価・値引きと同じく保存時に凍結する — 発行後に税率マスタが変わっても
  // 刷り直した PDF が動いてはいけない。
  const [catalog, customerTaxCategoryId, productTaxCategoryIds, standard] =
    await Promise.all([
      loadTaxCatalog(),
      customerTaxCategoryIdOf(v.customerBpId),
      productTaxCategoryMap(v.items.map((it) => Number(it.itemId))),
      // 標準価格（品目の定価）— 顧客の価格表が無い再研磨の品目はこちらで解決する。
      loadStandardUnitPrices(v.items.map((it) => it.itemId)),
    ]);
  // 明細の品目が種別と噛み合っているか（他社製品は売り物にならない・
  // 再研磨の行は再研磨の品目を指す）。
  const itemError = await salesLineItemError(v.items, tr);
  if (itemError) throw new LineItemResolveError(itemError);
  // 基準日は見積の作成日（まだ注文日が無い）。
  const basisDate = isoDateJst(new Date());

  const resolved = v.items.map((it, i) => {
    const resolution = resolvePriceFromEntries(
      entries,
      v.customerBpId,
      it.itemId,
      it.orderType,
      it.quantity,
      tr,
      new Date(),
      standard.get(Number(it.itemId)) ?? null,
    );
    if (!resolution.ok) {
      throw new LineItemResolveError(
        lineResolveMessage(resolution.reason, i + 1, it.quantity, tr),
      );
    }
    const r = resolution.price;
    const lineTax = resolveLineTax(catalog, {
      customerTaxCategoryId,
      productTaxCategoryId:
        productTaxCategoryIds.get(Number(it.itemId)) ?? null,
      basisDate,
    });
    const itemId = Number(it.itemId);
    return {
      itemId,
      orderType: it.orderType,
      quantity: it.quantity,
      unitPrice: r.unitPrice,
      priceListTierId: r.tierId,
      taxCategoryId: lineTax.categoryId,
      taxRate: lineTax.rate,
      discountAmount: r.discountAmount,
      discountLabel: r.discountLabel,
      // 円未満は明細の段階で丸める（請求書・CSV と同じ lib/money.ts）。
      amount: Math.max(
        0,
        roundYen(lineAmountYen(r.unitPrice, it.quantity) - r.discountAmount),
      ),
      deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
      // 明細の備考（複数行）。空白だけなら持たない — PDF に空の行を刷らない。
      notes: it.notes?.trim() ? it.notes.trimEnd() : null,
      sortOrder: i,
    };
  });
  return resolved;
}

export async function createQuote(
  payload: QuoteInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const parsed = quoteInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("quote", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const company = await resolveIssuingCompany(authz.userId, v.ownCompanyId);
    if (!company.ok) {
      return actionError(tr("common.issuingCompanyNotAllowed"));
    }
    const items = await resolveItems(v, tr, company.data.ownCompanyId);
    // 新規は prior 顧客が無いので、未指定なら顧客の主担当が入る。
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      null,
    );
    // 番号は DB が払い出す（INSERT トリガー）— 作った行から読み戻す。
    const created = await prisma.quote.create({
      data: {
        ...company.data,
        customerBpId: v.customerBpId,
        customerBranchBpId: v.customerBranchBpId,
        salesRepId,
        // status は既定 (DRAFT) のまま — 発行は issueQuote 経由の専用操作。
        validUntil: v.validUntil ? new Date(v.validUntil) : null,
        notes: v.notes.trim() || null,
        createdBy: authz.userId,
        items: { create: items },
      },
      select: { docRef: true },
    });
    const number = docIdOf(created);
    await recordAudit({
      action: "CREATE",
      tableName: "quotes",
      recordId: number,
      after: {
        customerBpId: v.customerBpId,
        salesRepId,
        status: "DRAFT",
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
        itemCount: v.items.length,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof LineItemResolveError) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.createFailed"), tr),
    );
  }
}

export async function updateQuote(
  number: string,
  payload: QuoteInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  const parsed = quoteInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  const v = parsed.data;
  try {
    const prior = await prisma.quote.findUnique({
      where: { docRef: key.docRef },
      select: {
        ownCompanyId: true,
        customerBpId: true,
        salesRepId: true,
        status: true,
        validUntil: true,
        notes: true,
      },
    });
    if (!prior) return actionError(tr("sales.quoteActions.quoteNotFound"));
    // 発行後は編集不可 — 直したくなったら複製して新しい見積を出す。
    if (prior.status !== "DRAFT") {
      return actionError(tr("sales.quoteActions.onlyDraftCanBeEdited"));
    }
    const items = await resolveItems(v, tr, prior.ownCompanyId);
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      prior.customerBpId,
    );
    await prisma.$transaction([
      prisma.quoteItem.deleteMany({
        where: { quote: { docRef: key.docRef } },
      }),
      prisma.quote.update({
        where: { docRef: key.docRef },
        data: {
          customerBpId: v.customerBpId,
          customerBranchBpId: v.customerBranchBpId,
          salesRepId,
          validUntil: v.validUntil ? new Date(v.validUntil) : null,
          notes: v.notes.trim() || null,
          items: { create: items },
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "quotes",
      recordId: number,
      before: {
        customerBpId: prior.customerBpId,
        salesRepId: prior.salesRepId,
        validUntil: prior.validUntil
          ? prior.validUntil.toISOString().slice(0, 10)
          : null,
        notes: prior.notes,
      },
      after: {
        customerBpId: v.customerBpId,
        salesRepId,
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof LineItemResolveError) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.updateFailed"), tr),
    );
  }
}

/**
 * 発行時の有効期限 — 必須で、**本日（JST の暦日）以降**。
 * 過去日で発行すると、発行した瞬間から「期限切れ」の見積書ができる。
 * 暦日の比較は quoteDisplayStatus と同じ `isoDateJst`（UTC の日付だと JST の
 * 早朝に前日扱いになる）。
 */
function issueValidUntilSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, tr("common.invalidInput"))
    .refine((d) => !Number.isNaN(Date.parse(d)), tr("common.invalidInput"))
    .refine(
      (d) => d >= isoDateJst(new Date()),
      tr("sales.quoteActions.validUntilInPast"),
    );
}

/** 発行 (DRAFT → ISSUED)。PDF 生成は /api/pdf/quote（呼び出し側）が担う。 */
export async function issueQuote(
  number: string,
  validUntil: string | null,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  // 権限 → 入力検証の順（未認証の呼び出しに検証文言を返さない）。
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  if (validUntil == null || validUntil === "") {
    return actionError(tr("sales.quoteActions.validUntilRequired"));
  }
  const parsedValidUntil = issueValidUntilSchema(tr).safeParse(validUntil);
  if (!parsedValidUntil.success) {
    return actionError(
      parsedValidUntil.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  try {
    const updated = await prisma.quote.updateMany({
      where: { docRef: key.docRef, status: "DRAFT" },
      data: {
        status: "ISSUED",
        validUntil: new Date(parsedValidUntil.data),
      },
    });
    if (updated.count === 0) {
      return actionError(tr("sales.quoteActions.onlyDraftCanBeIssued"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "quotes",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "ISSUED", validUntil },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.issueFailed"), tr),
    );
  }
}

/**
 * 発行ダイアログ・「メールで送付」の確認用: 誰に送るか（送れないなら理由）。
 * 宛先の決め方は lib/quote-mail-core.ts。
 */
export async function previewQuoteMail(
  number: string,
): Promise<ActionResult<{ name: string; email: string } | { reason: string }>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  const plan = await planQuoteMail(key);
  if (!plan.ok) {
    return actionOk({
      reason: tr(`sales.issueQuoteModal.reason.${plan.reason}`),
    });
  }
  return actionOk({
    name: plan.recipient.displayName,
    email: plan.recipient.email,
  });
}

/**
 * 発行済みの見積書を顧客へメールで知らせる（PDF は添付せず、宛先に束縛した
 * 書類リンクを載せる — lib/quote-mail.ts）。発行とは別の操作 — 発行は成功
 * したのに送れなかった、を「メールで送付」から送り直せるようにする。
 */
export async function emailQuote(
  number: string,
): Promise<ActionResult<{ to: string }>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  const actorId = await sessionUserId();
  if (!actorId) return actionError(tr("common.invalidInput"));
  const result = await sendQuoteMail(key, actorId);
  if (!result.ok) {
    return actionError(tr(`sales.issueQuoteModal.reason.${result.reason}`));
  }
  // 誰に送ったかを履歴に残す（取引先へ書類を出したという事実）。
  await recordAudit({
    action: "UPDATE",
    tableName: "quotes",
    recordId: number,
    after: { emailedTo: result.to },
  });
  revalidate(number);
  return actionOk({ to: result.to });
}
