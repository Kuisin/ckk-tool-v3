"use server";

/**
 * Server Actions — 締日処理 (app.billing_closings, BL02).
 *
 * runClosing(yearMonth): 対象月の未請求出荷（SHIPPED × DISPATCH）を顧客ごとに
 * 集計し、締日（BpCustomerAttrs.closingDay、既定 = 月末）で PENDING の
 * billing_closings 行を作成/更新する。既に処理済み（PROCESSED/EXPORTED）の
 * 行はスキップ。
 *
 * processClosing(id): PENDING の締日行から請求書を生成する —
 * allocateDocumentKey("INVOICE") で採番し、対象出荷の明細を invoice_items
 * （由来 = 出荷書/納品書キー）として一括作成。小計 Σ、消費税 = 小計×10%
 * （四捨五入）、支払期限 = 締日 + 支払サイト（既定 30 日）。$transaction で
 * 請求書作成と締日行の PROCESSED 化（+請求書リンク）を原子的に行う。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  closingDateReached,
  parseYearMonth,
} from "@/components/billing/closings/model";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import {
  resolveBillingPartyId,
  resolveDueDate,
} from "@/lib/billing-terms-core";
import { customerFacingProductLabel } from "@/lib/customer-product-code-core";
import { fetchCustomerProductLabels } from "@/lib/customer-product-codes";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { label } from "@/lib/messages";
import { lineAmountYen, type TaxBucket, totalsByRateYen } from "@/lib/money";
import { allocateDocumentKey } from "@/lib/numbering";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { billingBasisDate, resolveLineTax } from "@/lib/tax-rate";
import {
  billableUnitPrice,
  fetchBillableShipmentsForClosing,
  resolveBillingPeriodStart,
} from "./data";

const BASE_PATH = "/billing/closings";
const INVOICES_PATH = "/billing/invoices";

// 消費税率 — 顧客属性 tax_type から導出（監査 P0-5: 10% 固定を廃止）。
// 表は lib/tax-rate.ts（見積書の税額計算も同じ表を見る）。

/** DATE / タイムスタンプ → JST 暦日 "YYYY-MM-DD"。null はそのまま。 */
function isoDateOrNull(value: Date | null | undefined): string | null {
  return value == null ? null : isoDateJst(value);
}

/** 旧 enum に写せる区分コードか（tax_categories は独自コードも持てる）。 */
function asLegacyTaxType(
  code: string | null,
): "TAXABLE" | "EXEMPT" | "REDUCED" | null {
  return code === "TAXABLE" || code === "EXEMPT" || code === "REDUCED"
    ? code
    : null;
}

/** その率の束に属する明細の課税区分が 1 つに定まるならその id、でなければ null。 */
function bucketCategoryId(
  items: readonly { taxRate: number; taxCategoryId: number | null }[],
  taxRate: number,
): number | null {
  const ids = new Set(
    items
      .filter((it) => it.taxRate.toFixed(4) === taxRate.toFixed(4))
      .map((it) => it.taxCategoryId),
  );
  if (ids.size !== 1) return null;
  return ids.values().next().value ?? null;
}

/**
 * ヘッダに焼く課税区分・税率。**単一税率のときだけ**埋める。
 *
 * 混在請求書は 1 率しか持てないヘッダでは表せないので、どちらも null にして
 * 内訳を invoice_tax_summaries だけに持たせる。読み出し側は「束が無ければ
 * ヘッダから 1 本合成する」ので、旧データとの互換もこの形で保てる。
 */
function headerTaxSnapshot(
  items: readonly { taxRate: number; taxCategoryId: number | null }[],
  buckets: readonly TaxBucket[],
  catalog: { categories: readonly { id: number; code: string }[] },
): {
  taxType: "TAXABLE" | "EXEMPT" | "REDUCED" | null;
  taxRate: number | null;
} {
  if (buckets.length !== 1) return { taxType: null, taxRate: null };
  const rate = buckets[0].taxRate;
  const categoryId = bucketCategoryId(items, rate);
  const code =
    categoryId == null
      ? null
      : (catalog.categories.find((c) => c.id === categoryId)?.code ?? null);
  return { taxType: asLegacyTaxType(code), taxRate: rate };
}

export interface RunClosingResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * 請求明細 1 行（製品 / 追加料金で同じ形）。`items.push` するために、
 * flatMap の戻り値を推論に任せず明示する。
 */
interface InvoiceItemDraft {
  deliveryOrderYearMonth: string;
  deliveryOrderSeq: number;
  deliveryNoteYearMonth: string | null;
  deliveryNoteSeq: number | null;
  orderLineId: string | null;
  description: { ja: string; en: string };
  quantity: number;
  unitPrice: number;
  amount: number;
  taxCategoryId: number | null;
  taxRate: number;
  sortOrder: number;
}

/**
 * 締日処理を実行 — 対象月 "YYYYMM" の未請求出荷を顧客×締日で集計する。
 * 戻り値は作成/更新/スキップ（処理済み行）件数。
 */
export async function runClosing(
  yearMonth: string,
): Promise<ActionResult<RunClosingResult>> {
  const tr = await getTranslations();
  const ym = parseYearMonth(yearMonth);
  if (!ym) return actionError(tr("billing.closingActions.invalidYearMonth"));
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // バッチコアは lib/closing.ts（日次オートランと共通 — 監査 P2-4）
    const { runClosingBatch } = await import("@/lib/closing");
    const result = await runClosingBatch(ym.year, ym.month);
    if (result.created + result.updated + result.skipped === 0) {
      return actionError(
        tr("billing.closingActions.noUnbilledShipmentsForMonth"),
      );
    }
    revalidatePath(BASE_PATH);
    return actionOk(result);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.closingActions.runFailed"), tr),
    );
  }
}

/**
 * 請求書を生成 (PENDING → PROCESSED)。生成した請求書番号を返す —
 * クライアントは請求書詳細へ遷移する。
 */
export async function processClosing(
  id: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const closing = await prisma.billingClosing.findUnique({
      where: { id },
      include: {
        customerBp: { include: { customerAttrs: true } },
      },
    });
    if (!closing)
      return actionError(tr("billing.closingActions.closingNotFound"));
    if (closing.status !== "PENDING") {
      return actionError(tr("billing.closingActions.pendingOnly"));
    }
    // 締日の翌日から。締日前に処理すると、残りの出荷がどの窓にも入らない
    // （画面の isProcessable と同じ判定 — model.ts）。
    if (!closingDateReached(closing.closingDate, isoDateJst(new Date()))) {
      return actionError(tr("billing.closingActions.closingDateNotReached"));
    }

    const shipments = await fetchBillableShipmentsForClosing(
      closing.customerBpId,
      closing.closingDate,
    );
    if (shipments.length === 0) {
      return actionError(tr("billing.closings.thereAreNoShipmentsToBill"));
    }

    // 税区分マスタは 1 回だけ読む（cache() 済みだが意図を明示する）。
    const catalog = await loadTaxCatalog();
    // 取引先の課税区分。**null =「製品に従う」** で、入っていれば製品より優先する
    // （非課税の取引先に、製品の区分に関わらず 0% を通すため）。
    const customerTaxCategoryId =
      closing.customerBp.customerAttrs?.taxCategoryId ?? null;

    // 相手の品番（顧客品番 — MS04）。摘要に併記して相手が照合できるようにする。
    // **発行時に焼き込む** — 摘要は請求書が凍結する文言なので、あとで品番を
    // 直しても発行済みの請求書は動かない（金額・税率と同じ扱い）。
    const customerLabels = await fetchCustomerProductLabels(
      closing.customerBpId,
      shipments.flatMap((s) => s.items.map((it) => it.productId)),
    );

    // 明細: 出荷書明細 1 行 = 請求明細 1 行（摘要 = 製品名 + ロット、由来キー付き）。
    let sortOrder = 0;
    const items: InvoiceItemDraft[] = shipments.flatMap((s) => {
      const deliveryNote = s.deliveryNotes[0] ?? null;
      return s.items.map((it) => {
        // 単価は**その行**から取る（1 出荷書に単価の異なる複数明細が載り得る
        // ため、出荷書単位の単一単価では誤請求になる）。出荷書の確定時に
        // 焼き込んだ値が先で、無ければ注文明細の単価 — billableUnitPrice が
        // 唯一の定義元で、締日画面の予定額と同じ数え方になる。
        const unitPrice = billableUnitPrice(it);
        const name = it.product.name as LocalizedText | null;
        const customerLabel = customerLabels.get(it.productId);
        // 顧客品番はロット番号より内側に付ける — 「製品名（相手の品番）ロット …」
        // ではなく「製品名（相手の品番） ロット …」の順で読めるようにするため。
        const withCode = (locale: string) =>
          customerFacingProductLabel(localized(name, locale), customerLabel);
        const ja =
          it.lotNumber != null
            ? label("billing.closingActions.itemNameWithLot", "ja", "", {
                name: withCode("ja"),
                lot: it.lotNumber,
              })
            : withCode("ja");
        const en =
          it.lotNumber != null
            ? label("billing.closingActions.itemNameWithLot", "en", "", {
                name: withCode("en"),
                lot: it.lotNumber,
              })
            : withCode("en");
        // 税率は**行ごと**に決まる（製品ごとに課税区分が違い得る）。基準日は
        // 注文日 — 税率改正をまたぐ締日でも、引き渡しの約束をした時点の率が付く。
        // 落ち方は billingBasisDate 1 本に閉じてある。
        const lineTax = resolveLineTax(catalog, {
          customerTaxCategoryId,
          productTaxCategoryId: it.product.taxCategoryId,
          basisDate: billingBasisDate(
            isoDateOrNull(it.orderLine?.acceptance?.orderDate),
            isoDateOrNull(s.shippedAt),
            isoDateJst(closing.closingDate),
          ),
        });
        return {
          deliveryOrderYearMonth: s.yearMonth,
          deliveryOrderSeq: s.seq,
          deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
          deliveryNoteSeq: deliveryNote?.seq ?? null,
          // 注文明細 → 請求のトレーサビリティ（単価の出所）
          orderLineId: it.orderLineId,
          description: { ja, en },
          quantity: it.quantity,
          unitPrice,
          // 円未満は**行の段階で 1 回だけ**落とす（丸めの方針は lib/money.ts）。
          amount: lineAmountYen(unitPrice, it.quantity),
          // 税の根拠を行へ凍結する（金額を凍結するなら根拠も凍結する）。
          // **税額は行に持たない** — 税は率ごとの束でしか正しく丸められない。
          taxCategoryId: lineTax.categoryId,
          taxRate: lineTax.rate,
          sortOrder: sortOrder++,
        };
      });
    });

    // 追加料金（送料など）— 出荷書の行をそのまま請求明細にする。
    //
    // 税率の基準日は製品明細と違って **出荷日**（注文日ではない）。送料は
    // 引き渡しの約束ではなく「運んだ日の役務」なので、率が改正されたときに
    // 効くべきなのは運んだ日の率。区分は料金マスタが持つものを使い、顧客の
    // 指定があればそちらが勝つのは製品と同じ規約。
    const chargeItems = shipments.flatMap((s) => {
      const deliveryNote = s.deliveryNotes[0] ?? null;
      return s.charges.map((c) => {
        const name = c.chargeItem.name as LocalizedText | null;
        const suffix = c.description ? `（${c.description}）` : "";
        const lineTax = resolveLineTax(catalog, {
          customerTaxCategoryId,
          productTaxCategoryId: c.chargeItem.taxCategoryId,
          basisDate: billingBasisDate(
            null,
            isoDateOrNull(s.shippedAt),
            isoDateJst(closing.closingDate),
          ),
        });
        return {
          deliveryOrderYearMonth: s.yearMonth,
          deliveryOrderSeq: s.seq,
          deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
          deliveryNoteSeq: deliveryNote?.seq ?? null,
          // 追加料金は注文明細に紐づかない（出荷 1 件にかかるもの）。
          orderLineId: null,
          description: {
            ja: `${localized(name, "ja")}${suffix}`,
            en: `${localized(name, "en")}${suffix}`,
          },
          quantity: c.quantity,
          unitPrice: Number(c.unitPrice),
          // 金額は出荷書の行に焼き込んだものをそのまま使う（掛け算をやり直すと
          // 締日画面の予定額と 1 円ずれ得る）。
          amount: Number(c.amount),
          taxCategoryId: lineTax.categoryId,
          taxRate: lineTax.rate,
          sortOrder: sortOrder++,
        };
      });
    });
    items.push(...chargeItems);

    // 小計は**明細に印字される金額の和**（lib/money.ts の方針）。出荷書側で
    // 合算してから丸めると「小計 ≠ 明細の合計」になり、PDF と会計連携 CSV も
    // 食い違う（両者が別々にもう一度丸めていたため）。
    //
    // 税は**率ごとの束**で数える（適格請求書の区分記載）。束ごとに 1 回だけ丸める —
    // 行ごとに丸めると単一税率でも従来と 1 円ずれる（lib/money.ts）。
    const { subtotal, taxAmount, totalAmount, buckets } = totalsByRateYen(
      items.map((it) => ({ amount: it.amount, taxRate: it.taxRate })),
    );
    // ヘッダの課税区分・税率は**単一税率のときだけ**埋める。混在請求書は 2 率を
    // 表せないので null にし、内訳は invoice_tax_summaries だけが持つ。
    // 区分が 1 つに定まらないとき（同率の別区分が混ざる）も null。
    const { taxType, taxRate } = headerTaxSnapshot(items, buckets, catalog);

    const closingDate = closing.closingDate;
    // 請求期間 = 前回締日の翌日〜締日（対象出荷の収集と同じ区切り —
    // fetchBillableShipmentsForClosing / billingWindowFor）。
    const periodFrom = await resolveBillingPeriodStart(
      closing.customerBpId,
      closingDate,
    );
    // 支払期日は取引先マスタの **支払サイト + 支払日** から決める
    // （lib/billing-terms-core.ts が唯一の定義元）。支払日が未設定の取引先は
    // 従来どおり 締日 + 支払サイト（未設定は 30 日）で、1 日も変わらない。
    const dueDate = resolveDueDate(closingDate, {
      paymentTermsDays: closing.customerBp.customerAttrs?.paymentTermsDays,
      paymentDay: closing.customerBp.customerAttrs?.paymentDay,
    });
    // 請求書の宛先 — **請求先が設定されていればそちら**（別法人へまとめて
    // 請求する取引がある）。設定が無ければ従来どおり顧客本人。
    // 束ねはしない — 締日行は 顧客 × 締日 のままで、変わるのは宛先だけ。
    const billingPartyId = resolveBillingPartyId(
      closing.customerBpId,
      closing.customerBp.customerAttrs?.billingBpId,
    );
    // 支店: 対象出荷に共通の支店があれば引き継ぐ。
    const branchIds = new Set(shipments.map((s) => s.customerBranchBpId ?? ""));
    const customerBranchBpId =
      branchIds.size === 1 ? branchIds.values().next().value || null : null;
    // 営業担当も同じ考え方 — 対象出荷の担当（明細の注文請書ヘッダから導出）が
    // 1 人に定まればそれを引き継ぎ、ばらけていれば顧客の主担当を入れる
    // （請求書に編集フォームは無いので、ここで決めた値がそのまま残る）。
    const repIds = new Set(
      shipments.flatMap((s) =>
        s.items.map((it) => it.orderLine?.acceptance.salesRepId ?? ""),
      ),
    );
    const inheritedSalesRepId =
      repIds.size === 1 ? repIds.values().next().value || null : null;
    const salesRepId = await resolveSalesRepId(
      inheritedSalesRepId,
      closing.customerBpId,
      null,
    );

    const actorId = await getCurrentActorId();
    const { yearMonth, seq } = await allocateDocumentKey("INVOICE");
    const invoiceNumber = formatDocNumber("INV", { yearMonth, seq });

    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          yearMonth,
          seq,
          customerBpId: billingPartyId,
          // 請求先が別法人のときは支店の引き継ぎをしない（その支店は顧客側の
          // 組織で、請求先の支店ではないため）。
          customerBranchBpId:
            billingPartyId === closing.customerBpId ? customerBranchBpId : null,
          salesRepId,
          billingPeriodFrom: periodFrom,
          billingPeriodTo: closingDate,
          subtotal,
          taxAmount,
          totalAmount,
          // 税額の根拠のスナップショット（顧客マスタの現在値ではなく発行時点）。
          // 混在請求書ではどちらも null — 内訳は taxSummaries が持つ。
          taxType,
          taxRate,
          status: "DRAFT",
          dueDate,
          createdBy: actorId,
          items: { create: items },
          // 税率ごとの区分記載（適格請求書）。明細のスナップショットから集計して
          // 凍結する。Σ taxableBase = subtotal / Σ taxAmount = taxAmount。
          taxSummaries: {
            create: buckets.map((b, i) => ({
              taxCategoryId: bucketCategoryId(items, b.taxRate),
              taxRate: b.taxRate,
              taxableBase: b.taxableBase,
              taxAmount: b.taxAmount,
              sortOrder: i,
            })),
          },
        },
      });
      // status を where に含めた updateMany で二重処理を原子的にガードする。
      const updated = await tx.billingClosing.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "PROCESSED",
          totalAmount: subtotal,
          invoiceYearMonth: yearMonth,
          invoiceSeq: seq,
          processedAt: new Date(),
          processedBy: actorId,
        },
      });
      if (updated.count === 0) {
        throw new Error(`GUARD:${tr("billing.closingActions.pendingOnly")}`);
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "invoices",
      recordId: invoiceNumber,
      after: {
        customerBpId: billingPartyId,
        orderingCustomerBpId: closing.customerBpId,
        billingPeriodFrom: periodFrom.toISOString(),
        billingPeriodTo: closingDate.toISOString(),
        subtotal,
        taxAmount,
        totalAmount,
        taxType,
        taxRate,
        taxBuckets: buckets,
        status: "DRAFT",
        dueDate: dueDate.toISOString(),
        itemCount: items.length,
        closingId: id,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "billing_closings",
      recordId: id,
      before: { status: "PENDING" },
      after: { status: "PROCESSED", invoiceNumber },
    });

    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${id}`);
    revalidatePath(INVOICES_PATH);
    revalidatePath(`${INVOICES_PATH}/${invoiceNumber}`);
    return actionOk({ invoiceNumber });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("billing.closingActions.generateInvoiceFailed"),
        tr,
      ),
    );
  }
}

// ── まとめて請求書を生成 ─────────────────────────────────────────────────────

export interface BulkClosingResult {
  /** 生成できた請求書の番号（処理した順）。 */
  invoiceNumbers: string[];
  /** 生成できなかった締日行と、その理由。 */
  failures: { id: string; customerName: string; error: string }[];
}

/**
 * 選んだ締日行をまとめて請求書にする。
 *
 * 月初に何十件も並ぶ PENDING を 1 件ずつ開いて押していくのは、ただの作業で
 * しかないうえ、押し忘れた 1 件が翌月まで請求されないまま残る。
 *
 * ★ **1 件ずつ独立して処理する**（全体を 1 つの tx にしない）。1 社で
 *   「対象の出荷が無い」「締日前」のような理由が出ても、他の会社の請求書は
 *   出せたほうがよい — まとめて失敗させると、結局 1 件ずつやり直すことになる。
 *   失敗した行は理由つきで返し、画面が並べる。
 *
 * ★ 請求書の中身の作り方は processClosing と**同じ関数**を通る。別に書くと、
 *   1 件ずつ押したときとまとめて押したときで請求額が変わり得る。
 */
export async function processClosings(
  ids: string[],
): Promise<ActionResult<BulkClosingResult>> {
  const tr = await getTranslations();
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));

  // 名前は失敗の説明に要る（id だけ返されても、どの会社か分からない）。
  const rows = await prisma.billingClosing.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      closingDate: true,
      customerBp: { select: { name: true } },
    },
    orderBy: [{ closingDate: "asc" }],
  });
  const nameById = new Map(
    rows.map((r) => [
      r.id,
      localized(r.customerBp.name as LocalizedText | null),
    ]),
  );

  const invoiceNumbers: string[] = [];
  const failures: BulkClosingResult["failures"] = [];
  for (const row of rows) {
    const result = await processClosing(row.id);
    if (result.ok && result.data) {
      invoiceNumbers.push(result.data.invoiceNumber);
    } else if (!result.ok) {
      failures.push({
        id: row.id,
        customerName: nameById.get(row.id) ?? row.id,
        error: result.error,
      });
    }
  }
  return actionOk({ invoiceNumbers, failures });
}
