"use server";

/**
 * Server Actions — 請求書 (app.invoices, BL01).
 *
 * 請求書の作成は締日処理 (closings/actions.ts) / 手動請求 (new/actions.ts) が
 * 担うため、ここはステータス遷移 + 承認 + 一括操作のみ:
 *   DRAFT →(発行 issueInvoice)→ ISSUED →(送付 markSent)→ SENT
 *   →(入金 markPaid)→ PAID。
 * 遷移は status を where に含めた updateMany で原子的にガードする。
 *
 * **承認は 2 か所**（§9 更新。delivery_orders と同じ規約 — 対象種別を
 * 操作ごとに分ける）:
 *   `invoices`         — **追加費用ありの請求書だけ**、発行前に承認が要る。
 *                        承認は発行を「できるようにする」だけで、発行そのもの
 *                        は利用者が issueInvoice を押す（自動発行しない）。
 *   `invoice_payments` — 入金前承認。承認完了が**そのまま入金済みへ**進める
 *                        （work_order_flow_changes と同じ「承認で適用」の形）。
 * どちらも **承認設定 (MS0B) に段が 1 つも無ければ素通し**（既存の規約）。
 *
 * 会計連携 CSV エクスポート（accountingExportedAt の記録）は app/api/export/accounting。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { hasManualCharge } from "@/components/billing/invoices/model";
import {
  actOnCurrentStep,
  assertFlowConfigured,
  startApprovalFlow,
} from "@/lib/approvals";
import { recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/billing/invoices";

function revalidate(number: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${number}`);
}

type Tr = Awaited<ReturnType<typeof getTranslations>>;

/** 発行 / 入金の結果。`requested` = 発行・入金は起きず承認依頼だけ作った。 */
export interface IssueOrPaidResult {
  requested: boolean;
}

/**
 * 発行前承認のゲート — **追加費用ありの下書きだけ**通る。
 *
 * 戻り値 `null` = そのまま発行してよい。`ActionResult` を返したら
 * `issueInvoice` はそれをそのまま返して発行を止める。**依頼を作れたのは
 * 失敗ではない** — `actionOk({ requested: true })` で返し、呼び出し側が
 * 「発行しました」と「承認を依頼しました」を取り違えないようにする。
 */
async function guardIssueApproval(
  number: string,
  row: {
    status: string;
    approvalStatus: string;
    items: {
      deliveryOrderYearMonth: string | null;
      chargeItemId: number | null;
    }[];
  },
  actorId: string,
  tr: Tr,
): Promise<ActionResult<IssueOrPaidResult> | null> {
  if (row.status !== "DRAFT") return null;
  const manual = hasManualCharge(
    row.items.map((it) => ({
      isManualCharge:
        it.deliveryOrderYearMonth == null && it.chargeItemId != null,
    })),
  );
  if (!manual) return null;
  if (row.approvalStatus === "APPROVED") return null;
  if (row.approvalStatus === "PENDING") {
    return actionError(tr("billing.invoicesActions.awaitingIssueApproval"));
  }
  // 段が無ければ素通し（従来の規約）。
  if (await assertFlowConfigured("invoices")) return null;

  const started = await startApprovalFlow({
    targetType: "invoices",
    targetId: number,
  });
  if (!started.ok) {
    return actionError(
      started.error ?? tr("billing.invoicesActions.approvalRequestFailed"),
    );
  }
  await prisma.invoice.updateMany({
    where: { ...parseDocKey(number, "INV"), status: "DRAFT" },
    data: {
      approvalStatus: "PENDING",
      requestedAt: new Date(),
      requestedBy: actorId,
      rejectedAt: null,
      rejectedBy: null,
      rejectReason: null,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "invoices",
    recordId: number,
    before: { approvalStatus: row.approvalStatus },
    after: { approvalStatus: "PENDING" },
  });
  revalidate(number);
  return actionOk({ requested: true });
}

/** 発行 (DRAFT → ISSUED + issuedAt=now)。追加費用ありは発行前承認が要る。 */
export async function issueInvoice(
  number: string,
): Promise<ActionResult<IssueOrPaidResult>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        approvalStatus: true,
        items: {
          select: { deliveryOrderYearMonth: true, chargeItemId: true },
        },
      },
    });
    if (!row) {
      return actionError(tr("billing.invoicesActions.onlyDraftCanIssue"));
    }
    const gate = await guardIssueApproval(number, row, authz.userId, tr);
    if (gate) return gate;

    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError(tr("billing.invoicesActions.onlyDraftCanIssue"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "ISSUED" },
    });
    revalidate(number);
    return actionOk({ requested: false });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.invoicesActions.issueFailed"), tr),
    );
  }
}

/** 送付済み (ISSUED → SENT + sentAt=now)。承認は関わらない。 */
export async function markSent(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "ISSUED" },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError(tr("billing.invoicesActions.onlyIssuedCanMarkSent"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { status: "ISSUED" },
      after: { status: "SENT" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.invoicesActions.markSentFailed"), tr),
    );
  }
}

/**
 * 入金済み (SENT → PAID)。**入金前承認フローが組んであれば依頼を出して
 * 止まる** — 承認が下りると（invoice_payments の approveInvoicePayment が）
 * そのまま PAID にする。段が無ければ従来どおりこの場で PAID にする。
 */
export async function markPaid(
  number: string,
): Promise<ActionResult<IssueOrPaidResult>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true, approvalStatus: true },
    });
    if (!row || row.status !== "SENT") {
      return actionError(tr("billing.invoicesActions.onlySentCanMarkPaid"));
    }
    if (row.approvalStatus === "PENDING") {
      return actionError(tr("billing.invoicesActions.awaitingPaymentApproval"));
    }

    // 段が無ければ素通し（従来の規約）— このままこの場で PAID にする。
    if (await assertFlowConfigured("invoice_payments")) {
      const updated = await prisma.invoice.updateMany({
        where: { ...key, status: "SENT" },
        data: { status: "PAID" },
      });
      if (updated.count === 0) {
        return actionError(tr("billing.invoicesActions.onlySentCanMarkPaid"));
      }
      await recordAudit({
        action: "UPDATE",
        tableName: "invoices",
        recordId: number,
        before: { status: "SENT" },
        after: { status: "PAID" },
      });
      revalidate(number);
      return actionOk({ requested: false });
    }

    const started = await startApprovalFlow({
      targetType: "invoice_payments",
      targetId: number,
    });
    if (!started.ok) {
      return actionError(
        started.error ?? tr("billing.invoicesActions.approvalRequestFailed"),
      );
    }
    await prisma.invoice.updateMany({
      where: { ...key, status: "SENT" },
      data: {
        approvalStatus: "PENDING",
        requestedAt: new Date(),
        requestedBy: authz.userId,
        rejectedAt: null,
        rejectedBy: null,
        rejectReason: null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { approvalStatus: row.approvalStatus },
      after: { approvalStatus: "PENDING" },
    });
    revalidate(number);
    return actionOk({ requested: true });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.invoicesActions.markPaidFailed"), tr),
    );
  }
}

// ── 発行前承認 (invoices) ────────────────────────────────────────────────────

/** 承認 — 全段通過で approvalStatus=APPROVED（発行できるようになるだけ）。 */
export async function approveInvoiceIssue(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("invoice");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  try {
    const prior = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true },
    });
    if (!prior) return actionError(tr("billing.invoicesActions.invalidNumber"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("common.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "invoices",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    if (!acted.flowCompleted) {
      revalidate(number);
      return actionOk();
    }
    await prisma.invoice.update({
      where: { yearMonth_seq: key },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: authz.userId,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "APPROVED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し（理由必須）— 下書きのままなので、費用を直して出し直せる。 */
export async function rejectInvoiceIssue(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("invoice");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  try {
    const prior = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true },
    });
    if (!prior) return actionError(tr("billing.invoicesActions.invalidNumber"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("common.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "invoices",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    await prisma.invoice.update({
      where: { yearMonth_seq: key },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectedBy: authz.userId,
        rejectReason: trimmed,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "REJECTED", rejectReason: trimmed },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

// ── 入金前承認 (invoice_payments) ────────────────────────────────────────────

/** 承認 — 全段通過で**そのまま入金済みへ**進める（work_order_flow_changes と同じ形）。 */
export async function approveInvoicePayment(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("invoice");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  try {
    const prior = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true, approvalStatus: true },
    });
    if (!prior) return actionError(tr("billing.invoicesActions.invalidNumber"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("common.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "invoice_payments",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    if (!acted.flowCompleted) {
      revalidate(number);
      return actionOk();
    }
    // 最終承認 = 入金済み。途中承認では status を動かさない。
    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "SENT" },
      data: {
        status: "PAID",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: authz.userId,
      },
    });
    if (updated.count === 0) {
      return actionError(tr("billing.invoicesActions.onlySentCanMarkPaid"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { status: "SENT", approvalStatus: "PENDING" },
      after: { status: "PAID", approvalStatus: "APPROVED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し（理由必須）— 送付済みのまま残り、再度「入金」から出し直せる。 */
export async function rejectInvoicePayment(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("invoice");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  try {
    const prior = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      select: { approvalStatus: true },
    });
    if (!prior) return actionError(tr("billing.invoicesActions.invalidNumber"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("common.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "invoice_payments",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    await prisma.invoice.update({
      where: { yearMonth_seq: key },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectedBy: authz.userId,
        rejectReason: trimmed,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "REJECTED", rejectReason: trimmed },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

// ── 承認・差し戻し（発行前 / 入金前を状態から自動判定して呼び分け） ───────────

/** その請求書がいま通っている承認の種別（依頼中でなければ null）。 */
function approvalTypeFor(
  status: string,
): "invoices" | "invoice_payments" | null {
  if (status === "DRAFT") return "invoices";
  if (status === "SENT") return "invoice_payments";
  return null;
}

/**
 * 承認（単一） — 請求書の現在の状態から発行前 / 入金前を判断して振り分ける。
 * 一覧の一括承認・詳細画面のボタンのどちらもこれを通る。
 */
export async function approveInvoiceApproval(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const row = await prisma.invoice.findUnique({
    where: { yearMonth_seq: key },
    select: { status: true },
  });
  if (!row) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const type = approvalTypeFor(row.status);
  if (!type) return actionError(tr("common.notPendingApproval"));
  return type === "invoices"
    ? approveInvoiceIssue(number)
    : approveInvoicePayment(number);
}

/** 差し戻し（単一） — approveInvoiceApproval と同じ振り分け。 */
export async function rejectInvoiceApproval(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const row = await prisma.invoice.findUnique({
    where: { yearMonth_seq: key },
    select: { status: true },
  });
  if (!row) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const type = approvalTypeFor(row.status);
  if (!type) return actionError(tr("common.notPendingApproval"));
  return type === "invoices"
    ? rejectInvoiceIssue(number, reason)
    : rejectInvoicePayment(number, reason);
}

// ── 一括操作（一覧の DataTable bulkActions から） ────────────────────────────

export interface BulkInvoiceResult {
  done: string[];
  failures: { number: string; error: string }[];
}

/**
 * 選んだ請求書をまとめて処理する共通の形。**1 件ずつ独立に処理する**
 * （closings/actions.ts processClosings と同じ規約）— 1 通の失敗で他社の
 * 請求書を止めない。中身は単数形の関数を呼ぶだけにして、1 件ずつ押したときと
 * 結果が変わらないようにする。
 */
async function runBulk<T>(
  numbers: string[],
  fn: (number: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<BulkInvoiceResult>> {
  const tr = await getTranslations();
  if (numbers.length === 0) return actionError(tr("common.noTargetSelected"));
  const done: string[] = [];
  const failures: BulkInvoiceResult["failures"] = [];
  for (const number of numbers) {
    const result = await fn(number);
    if (result.ok) done.push(number);
    else failures.push({ number, error: result.error });
  }
  return actionOk({ done, failures });
}

/**
 * 一括発行。**追加費用ありで未承認の請求書は 1 件ずつ押したときと同じ理由で
 * 失敗する**（承認が要る書類を一括からわざと外さない — 何が止まったかを
 * 失敗一覧に出す）。
 */
export async function issueInvoices(
  numbers: string[],
): Promise<ActionResult<BulkInvoiceResult>> {
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  return runBulk(numbers, issueInvoice);
}

/** 一括「入金」— 段が無ければ即入金済み、あれば依頼を出す（markPaid と同じ）。 */
export async function requestInvoicePayments(
  numbers: string[],
): Promise<ActionResult<BulkInvoiceResult>> {
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  return runBulk(numbers, markPaid);
}

/** 一括承認 — 各行の状態（発行前 / 入金前）に応じて振り分ける。 */
export async function approveInvoices(
  numbers: string[],
): Promise<ActionResult<BulkInvoiceResult>> {
  return runBulk(numbers, approveInvoiceApproval);
}

/** 一括差し戻し（理由は全件共通）。 */
export async function rejectInvoices(
  numbers: string[],
  reason: string,
): Promise<ActionResult<BulkInvoiceResult>> {
  return runBulk(numbers, (n) => rejectInvoiceApproval(n, reason));
}
