"use server";

/**
 * Server Actions — 受注書 (app.sales_orders, PD01).
 *
 * 受注書は「一括作成」— 1回の作成で allocateDocumentKey("ORDER") を1度だけ
 * 呼び、明細行ごとに branch = 1..N の行を $transaction で作る。表示番号
 * ORD-YYYYMM-NNNNN-NN は導出（保存しない）。
 *
 * 単価は価格表（顧客×製品×注文種別×数量）から自動解決できるが、受注書は
 * 顧客注文書と突き合わせる文書のため手動上書きも許す（見積書と異なる）。
 * 編集・確定は「下書きかつ未ロック（isLocked=false）」の行のみ。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveUnitPriceFromEntries } from "@/components/sales/quotes/model";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatSalesOrderNumber, parseSalesOrderKey } from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { fetchEntriesForCustomer } from "../../sales/quotes/data";

const BASE_PATH = "/production/sales-orders";

const orderTypeEnum = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

const lineInput = z.object({
  productId: z.string().min(1, "製品を選択してください"),
  orderType: orderTypeEnum,
  quantity: z.number().int().min(1, "数量は1以上"),
  unitPrice: z.number().min(0, "単価は0以上"),
  deliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
});

const createInput = z.object({
  customerBpId: z.string().min(1, "顧客を選択してください"),
  customerBranchBpId: z.string().nullable(),
  customerOrderRef: z.string().nullable(),
  /** 既定納期 — 行納期が空の行に適用する。 */
  deliveryDate: z.string().nullable(),
  lines: z.array(lineInput).min(1, "明細を1件以上追加してください"),
});

const updateInput = lineInput.extend({
  customerOrderRef: z.string().nullable(),
});

export type SalesOrderCreateInput = z.infer<typeof createInput>;
export type SalesOrderUpdateInput = z.infer<typeof updateInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

/**
 * 価格表からの単価ライブ解決（フォームの自動入力用）。
 * 見積書と同じ解決ロジック（quotes/model の pure 関数）をサーバー側で実行する
 * — 製品マスタが大きく SearchSelect 運用のため、entries をクライアントへ
 * 常送せずに行単位で解決する。未解決（価格表なし）は null。
 */
export async function resolvePriceForLine(
  customerBpId: string,
  productId: string,
  orderType: string,
  quantity: number,
): Promise<{ unitPrice: number; tierLabel: string | null } | null> {
  if (!customerBpId || !productId || quantity < 1) return null;
  try {
    const entries = await fetchEntriesForCustomer(customerBpId);
    const r = resolveUnitPriceFromEntries(
      entries,
      customerBpId,
      productId,
      orderType,
      quantity,
    );
    return r ? { unitPrice: r.unitPrice, tierLabel: r.tierLabel } : null;
  } catch (e) {
    console.error("resolvePriceForLine failed", e);
    return null;
  }
}

/**
 * 一括作成 — 採番は1回、行は branch = 1..N。作成後は先頭行の詳細ページへ
 * 遷移するため、先頭行の番号（と全行番号）を返す。
 */
export async function createSalesOrders(
  payload: SalesOrderCreateInput,
): Promise<ActionResult<{ number: string; numbers: string[] }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    // 採番は作成バッチごとに1回のみ — 全行が同じ (yearMonth, seq) を共有する。
    const { yearMonth, seq } = await allocateDocumentKey("ORDER");
    // 行納期が空なら既定納期を適用。
    const effectiveDelivery = (ln: (typeof v.lines)[number]) =>
      trimOrNull(ln.deliveryDate) ?? trimOrNull(v.deliveryDate);
    await prisma.$transaction(
      v.lines.map((ln, i) => {
        const delivery = effectiveDelivery(ln);
        return prisma.salesOrder.create({
          data: {
            yearMonth,
            seq,
            branch: i + 1,
            customerBpId: v.customerBpId,
            customerBranchBpId: v.customerBranchBpId,
            customerOrderRef: trimOrNull(v.customerOrderRef),
            productId: Number(ln.productId),
            orderType: ln.orderType,
            quantity: ln.quantity,
            unitPrice: ln.unitPrice,
            // 金額はサーバー側で計算（クライアント表示値は信用しない）。
            amount: ln.quantity * ln.unitPrice,
            deliveryDate: delivery ? new Date(delivery) : null,
            status: "DRAFT",
            notes: trimOrNull(ln.notes),
          },
        });
      }),
    );
    const numbers = v.lines.map((_, i) =>
      formatSalesOrderNumber({ yearMonth, seq, branch: i + 1 }),
    );
    // 監査ログは行（ORD-…-NN）単位。
    for (const [i, ln] of v.lines.entries()) {
      await recordAudit({
        action: "CREATE",
        tableName: "sales_orders",
        recordId: numbers[i],
        after: {
          customerBpId: v.customerBpId,
          customerBranchBpId: v.customerBranchBpId,
          customerOrderRef: trimOrNull(v.customerOrderRef),
          productId: Number(ln.productId),
          orderType: ln.orderType,
          quantity: ln.quantity,
          unitPrice: ln.unitPrice,
          amount: ln.quantity * ln.unitPrice,
          deliveryDate: effectiveDelivery(ln),
          status: "DRAFT",
        },
      });
    }
    revalidate();
    return actionOk({ number: numbers[0], numbers });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "受注書の作成に失敗しました"));
  }
}

/** 更新 — 下書きかつ未ロックの行のみ（サーバー側でも必ずガード）。 */
export async function updateSalesOrder(
  number: string,
  payload: SalesOrderUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const key = parseSalesOrderKey(number);
  if (!key) return actionError("受注番号が不正です");
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.salesOrder.findUnique({
      where: { yearMonth_seq_branch: key },
      select: {
        customerOrderRef: true,
        productId: true,
        orderType: true,
        quantity: true,
        unitPrice: true,
        deliveryDate: true,
        notes: true,
      },
    });
    // status/isLocked を where に含めた updateMany で原子的にガードする。
    const updated = await prisma.salesOrder.updateMany({
      where: { ...key, status: "DRAFT", isLocked: false },
      data: {
        customerOrderRef: trimOrNull(v.customerOrderRef),
        productId: Number(v.productId),
        orderType: v.orderType,
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        amount: v.quantity * v.unitPrice,
        deliveryDate: v.deliveryDate ? new Date(v.deliveryDate) : null,
        notes: trimOrNull(v.notes),
      },
    });
    if (updated.count === 0) {
      return actionError("下書きかつロックされていない受注書のみ編集できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "sales_orders",
      recordId: number,
      before: prior
        ? {
            customerOrderRef: prior.customerOrderRef,
            productId: prior.productId,
            orderType: prior.orderType,
            quantity: prior.quantity,
            unitPrice: Number(prior.unitPrice),
            deliveryDate:
              prior.deliveryDate?.toISOString().slice(0, 10) ?? null,
            notes: prior.notes,
          }
        : undefined,
      after: {
        customerOrderRef: trimOrNull(v.customerOrderRef),
        productId: Number(v.productId),
        orderType: v.orderType,
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        deliveryDate: v.deliveryDate,
        notes: trimOrNull(v.notes),
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "受注書の更新に失敗しました"));
  }
}

/** 確定 (DRAFT → CONFIRMED)。ロック中（承認依頼中）は不可。 */
export async function confirmSalesOrder(number: string): Promise<ActionResult> {
  const key = parseSalesOrderKey(number);
  if (!key) return actionError("受注番号が不正です");
  try {
    const updated = await prisma.salesOrder.updateMany({
      where: { ...key, status: "DRAFT", isLocked: false },
      data: { status: "CONFIRMED" },
    });
    if (updated.count === 0) {
      return actionError("下書きの受注書のみ確定できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "sales_orders",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "CONFIRMED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "確定に失敗しました"));
  }
}

/** キャンセル — 出荷済（SHIPPED）以降・キャンセル済は不可。 */
export async function cancelSalesOrder(number: string): Promise<ActionResult> {
  const key = parseSalesOrderKey(number);
  if (!key) return actionError("受注番号が不正です");
  try {
    const prior = await prisma.salesOrder.findUnique({
      where: { yearMonth_seq_branch: key },
      select: { status: true },
    });
    const updated = await prisma.salesOrder.updateMany({
      where: {
        ...key,
        status: {
          in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"],
        },
      },
      data: { status: "CANCELLED" },
    });
    if (updated.count === 0) {
      return actionError("出荷済・キャンセル済の受注書はキャンセルできません");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "sales_orders",
      recordId: number,
      before: { status: prior?.status ?? null },
      after: { status: "CANCELLED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}
