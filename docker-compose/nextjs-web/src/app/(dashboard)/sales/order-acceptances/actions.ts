"use server";

/**
 * Server Actions — 受注請書 intake (app.order_acceptances, SA03)。
 *
 * ライフサイクル遷移:
 *   IMPORT（抽出失敗）→ 再抽出（retryExtraction — lib/intake.runExtraction）
 *   DRAFT → saveDraft（ヘッダ + 明細全置換）/ submitForApproval（→ REQUESTED）
 *   REQUESTED → approveAcceptance（→ APPROVED）/ rejectAcceptance（→ DRAFT）
 *   APPROVED → deployToSalesOrders（伝票展開 → COMPLETED）
 *   COMPLETED → archiveAcceptance（→ ARCHIVED）
 *
 * 伝票展開は受注請書と同じ (year_month, seq) の sales_orders 枝番 1..N を
 * $transaction で一括作成する（§2: 受注請書 1 → 注文請書 N）。承認は
 * lib/approvals（approval_requests / approval_records — FIRST 段のみ）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actOnApprovalRequest, createApprovalRequest } from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatSalesOrderNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { runExtraction } from "@/lib/intake";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/order-acceptances";
const SALES_ORDERS_PATH = "/production/sales-orders";
const APPROVALS_PATH = "/production/approvals";

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(APPROVALS_PATH);
  if (number) revalidatePath(`${BASE_PATH}/${number}`);
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

/** 番号（ORD-YYYYMM-NNNNN）→ 複合キー。不正は null。 */
function keyOf(number: string): DocKey | null {
  return parseDocKey(number.trim(), "ORD");
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

const orderTypeEnum = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

const itemInput = z.object({
  /** 製品マスタ内部 id（文字列）。null = 未突合（productText のみ）。 */
  productId: z.string().nullable(),
  productText: z.string().nullable(),
  orderType: orderTypeEnum,
  quantity: z.number().int().min(1, "数量は1以上"),
  unitPrice: z.number().min(0, "単価は0以上").nullable(),
  deliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
});

const draftInput = z.object({
  customerBpId: z.string().nullable(),
  customerOrderRef: z.string().nullable(),
  orderDate: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(itemInput),
});

const manualInput = draftInput.extend({
  customerBpId: z.string().min(1, "顧客を選択してください"),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

export type OrderAcceptanceDraftInput = z.infer<typeof draftInput>;
export type OrderAcceptanceManualInput = z.infer<typeof manualInput>;

/** 明細入力 → create データ。 */
function buildItemCreates(items: OrderAcceptanceDraftInput["items"]) {
  return items.map((it, i) => ({
    productId: it.productId ? Number(it.productId) : null,
    productText: trimOrNull(it.productText),
    orderType: it.orderType,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
    notes: trimOrNull(it.notes),
    sortOrder: i,
  }));
}

// ── 再抽出（IMPORT のみ） ────────────────────────────────────────────────────

/** 抽出失敗した IMPORT 行の再抽出。成功で DRAFT へ（数十秒かかる）。 */
export async function retryExtraction(number: string): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "IMPORT") {
      return actionError("取込中（未抽出）の受注請書のみ再抽出できます");
    }
    const result = await runExtraction(key);
    revalidate(number);
    if (result.status !== "DRAFT") {
      return actionError(result.error ?? "抽出に失敗しました");
    }
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "再抽出に失敗しました"));
  }
}

// ── 下書き保存（DRAFT のみ） ─────────────────────────────────────────────────

/** ヘッダ + 明細（全置換）を保存する。DRAFT のみ。 */
export async function saveDraft(
  number: string,
  payload: OrderAcceptanceDraftInput,
): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const parsed = draftInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        customerBpId: true,
        customerOrderRef: true,
        orderDate: true,
        notes: true,
      },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("下書きの受注請書のみ編集できます");
    }
    const creates = buildItemCreates(v.items);
    await prisma.$transaction(async (tx) => {
      await tx.orderAcceptanceItem.deleteMany({
        where: { acceptanceYearMonth: key.yearMonth, acceptanceSeq: key.seq },
      });
      await tx.orderAcceptance.update({
        where: { yearMonth_seq: key },
        data: {
          customerBpId: trimOrNull(v.customerBpId),
          customerOrderRef: trimOrNull(v.customerOrderRef),
          orderDate: v.orderDate ? new Date(v.orderDate) : null,
          notes: trimOrNull(v.notes),
          items: { create: creates },
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: {
        customerBpId: prior.customerBpId,
        customerOrderRef: prior.customerOrderRef,
        orderDate: prior.orderDate?.toISOString().slice(0, 10) ?? null,
        notes: prior.notes,
      },
      after: {
        customerBpId: trimOrNull(v.customerBpId),
        customerOrderRef: trimOrNull(v.customerOrderRef),
        orderDate: v.orderDate,
        notes: trimOrNull(v.notes),
        itemCount: creates.length,
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "受注請書の保存に失敗しました"));
  }
}

// ── 承認フロー ───────────────────────────────────────────────────────────────

/** 承認依頼 — DRAFT → REQUESTED（顧客特定 + 明細 1 件以上が必要）。 */
export async function submitForApproval(number: string): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        customerBpId: true,
        _count: { select: { items: true } },
      },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("下書きの受注請書のみ承認依頼できます");
    }
    if (!prior.customerBpId) {
      return actionError("顧客が未特定です。顧客を選択して保存してください");
    }
    if (prior._count.items < 1) {
      return actionError("明細が1件もありません。明細を追加してください");
    }
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { status: "REQUESTED" },
    });
    // 正規化された承認依頼行（PD03 横断表示・承認記録の紐付け先）。
    await createApprovalRequest({
      targetType: "order_acceptances",
      targetId: number,
      step: "FIRST",
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "REQUESTED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/** 承認 — REQUESTED → APPROVED。第一承認グループのメンバー（or 代理）のみ。 */
export async function approveAcceptance(number: string): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const authz = await checkPermission("order_acceptance", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の受注請書ではありません");
    }
    const acted = await actOnApprovalRequest({
      targetType: "order_acceptances",
      targetId: number,
      step: "FIRST",
      groupType: "FIRST",
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { status: "APPROVED" },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "REQUESTED" },
      after: { status: "APPROVED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 差し戻し — REQUESTED → DRAFT（理由必須）。 */
export async function rejectAcceptance(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  const authz = await checkPermission("order_acceptance", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の受注請書ではありません");
    }
    const acted = await actOnApprovalRequest({
      targetType: "order_acceptances",
      targetId: number,
      step: "FIRST",
      groupType: "FIRST",
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "差し戻しの権限がありません");
    }
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { status: "DRAFT" },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "REQUESTED" },
      after: { status: "DRAFT", rejectReason: trimmed },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}

// ── 伝票展開（APPROVED → COMPLETED） ────────────────────────────────────────

/**
 * 伝票展開 — 明細ごとに注文請書（sales_orders）を作成する。
 * 受注請書と同じ (year_month, seq) を共有し、枝番 branch = 1..N。
 * 全明細が製品特定済み + 単価入力済みであることが必要。
 */
export async function deployToSalesOrders(
  number: string,
): Promise<ActionResult<{ numbers: string[] }>> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const authz = await checkPermission("order_acceptance", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!prior) return actionError("対象の受注請書が見つかりません");
    if (prior.status !== "APPROVED") {
      return actionError("承認済の受注請書のみ展開できます");
    }
    if (!prior.customerBpId) {
      return actionError("顧客が未特定のため展開できません");
    }
    if (prior.items.length < 1) {
      return actionError("明細がありません");
    }
    // 全明細の突合・単価を検証（不備行を列挙して返す）。
    const offending = prior.items
      .map((it, i) => ({ row: i + 1, it }))
      .filter(({ it }) => it.productId == null || it.unitPrice == null);
    if (offending.length > 0) {
      const rows = offending.map((o) => `${o.row}`).join(", ");
      return actionError(
        `明細 ${rows} 行目: 製品未特定または単価未入力のため展開できません`,
      );
    }

    const completedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // 二重展開ガード — APPROVED の行だけを原子的に COMPLETED へ。
      const updated = await tx.orderAcceptance.updateMany({
        where: { ...key, status: "APPROVED" },
        data: { status: "COMPLETED", completedAt },
      });
      if (updated.count === 0) {
        throw new Error("承認済の受注請書のみ展開できます");
      }
      for (const [i, it] of prior.items.entries()) {
        await tx.salesOrder.create({
          data: {
            yearMonth: key.yearMonth,
            seq: key.seq,
            branch: i + 1,
            customerBpId: prior.customerBpId as string,
            customerBranchBpId: prior.customerBranchBpId,
            customerOrderRef: prior.customerOrderRef,
            productId: it.productId as number,
            orderType: it.orderType,
            quantity: it.quantity,
            unitPrice: it.unitPrice as NonNullable<typeof it.unitPrice>,
            // 金額はサーバー側で計算。
            amount: it.quantity * Number(it.unitPrice),
            deliveryDate: it.deliveryDate,
            status: "CONFIRMED",
            notes: it.notes,
          },
        });
      }
    });

    const numbers = prior.items.map((_, i) =>
      formatSalesOrderNumber({ ...key, branch: i + 1 }),
    );
    for (const [i, it] of prior.items.entries()) {
      await recordAudit({
        action: "CREATE",
        tableName: "sales_orders",
        recordId: numbers[i],
        after: {
          note: `受注請書 ${number} の伝票展開`,
          customerBpId: prior.customerBpId,
          productId: it.productId,
          orderType: it.orderType,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          status: "CONFIRMED",
        },
      });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "APPROVED" },
      after: { status: "COMPLETED", salesOrders: numbers },
    });
    revalidate(number);
    revalidatePath(SALES_ORDERS_PATH);
    return actionOk({ numbers });
  } catch (e) {
    if (e instanceof Error && e.message.includes("展開")) {
      return actionError(e.message);
    }
    return actionError(prismaErrorMessage(e, "伝票展開に失敗しました"));
  }
}

/** アーカイブ — COMPLETED → ARCHIVED。 */
export async function archiveAcceptance(number: string): Promise<ActionResult> {
  const key = keyOf(number);
  if (!key) return actionError("受注請書番号が不正です");
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.orderAcceptance.updateMany({
      where: { ...key, status: "COMPLETED" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError("展開済の受注請書のみアーカイブできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "COMPLETED" },
      after: { status: "ARCHIVED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "アーカイブに失敗しました"));
  }
}

// ── 手入力作成（MANUAL） ─────────────────────────────────────────────────────

/** 手入力の受注請書を DRAFT で作成する（source = MANUAL）。 */
export async function createManualAcceptance(
  payload: OrderAcceptanceManualInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = manualInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("order_acceptance", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const actor = await getCurrentActorId();
    const { yearMonth, seq } = await allocateDocumentKey("ORDER");
    const number = `ORD-${yearMonth}-${String(seq).padStart(5, "0")}`;
    await prisma.orderAcceptance.create({
      data: {
        yearMonth,
        seq,
        status: "DRAFT",
        source: "MANUAL",
        customerBpId: v.customerBpId,
        customerOrderRef: trimOrNull(v.customerOrderRef),
        orderDate: v.orderDate ? new Date(v.orderDate) : null,
        notes: trimOrNull(v.notes),
        createdBy: actor,
        items: { create: buildItemCreates(v.items) },
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "order_acceptances",
      recordId: number,
      after: {
        note: "手入力で作成",
        customerBpId: v.customerBpId,
        itemCount: v.items.length,
        status: "DRAFT",
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "受注請書の作成に失敗しました"));
  }
}
