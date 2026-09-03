"use server";

/**
 * Server Actions — 注文請書 intake (app.order_acceptances, SA04)。
 *
 * ライフサイクル遷移:
 *   IMPORT（抽出失敗）→ 再抽出（retryExtraction — lib/intake の抽出キューへ積む）
 *   DRAFT → saveDraft（ヘッダ + 明細全置換）/ submitForApproval（→ REQUESTED）
 *   REQUESTED → approveAcceptance（→ APPROVED）/ rejectAcceptance（→ DRAFT）
 *   APPROVED → confirmOrderLines（注文確定 → COMPLETED）
 *   COMPLETED → archiveAcceptance（→ ARCHIVED）
 *   COMPLETED → requestAcceptanceCancel（キャンセル承認 → CANCELLED。
 *               明細単位のキャンセルは廃止 — lib/order-acceptance-cancel.ts）
 *
 * 注文確定は注文請書と同じ (year_month, seq) の order_lines 枝番 1..N を
 * $transaction で一括作成する（§2: 注文請書 1 → 注文明細 N）。承認は
 * lib/approvals（approval_requests / approval_records — FIRST 段のみ）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  actOnCurrentStep,
  assertFlowConfigured,
  startApprovalFlow,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatOrderLineNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { enqueueExtraction } from "@/lib/intake";
import { normalizeExtraction } from "@/lib/intake-core";
import { aliasLearnings } from "@/lib/match-alias-core";
import { saveAliasLearnings } from "@/lib/match-aliases";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  applyApprovedAcceptanceCancel,
  closeAcceptanceCancelRequest,
  submitAcceptanceCancelRequest,
} from "@/lib/order-acceptance-cancel";
import {
  acceptanceReadiness,
  readinessSummary,
} from "@/lib/order-acceptance-readiness";
import { linesReplaceBlockReason, nextBranches } from "@/lib/order-line-core";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { checkAcceptancePrices, priceDiffSummary } from "./price-check";

const BASE_PATH = "/sales/order-acceptances";
const SALES_ORDERS_PATH = "/sales/order-lines";
const APPROVALS_PATH = "/general/tasks";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

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

/**
 * 対象注文請書がスコープ内か（OWN 行チェック）。ALL は素通し。
 * 不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function acceptanceInScope(
  access: Access,
  userId: string,
  key: DocKey,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: { createdBy: true },
  });
  if (!row) return true;
  return rowInScope(access, { createdBy: row.createdBy }, userId);
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

const orderTypeEnum = z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]);

function itemInputSchema(tr: Tr) {
  return z.object({
    /** 製品マスタ内部 id（文字列）。null = 未突合（productText のみ）。 */
    productId: z.string().nullable(),
    productText: z.string().nullable(),
    orderType: orderTypeEnum,
    quantity: z
      .number()
      .int()
      .min(1, tr("sales.orderAcceptanceActions.quantityMin1")),
    unitPrice: z
      .number()
      .min(0, tr("sales.orderAcceptanceActions.unitPriceMin0"))
      .nullable(),
    deliveryDate: z.string().nullable(),
    notes: z.string().nullable(),
  });
}

function draftInputSchema(tr: Tr) {
  return z.object({
    customerBpId: z.string().nullable(),
    // 営業担当 — 顧客の担当一覧（bp_sales_reps）から選ぶ。未指定のまま顧客を
    // 変えたときは、その顧客の主担当を既定として入れる（lib/sales-rep）。
    salesRepId: z.string().nullable().optional(),
    // 出荷先（顧客と異なり得る取引先。任意）
    shipToBpId: z.string().nullable().optional(),
    // 配送方法（通常配送 / ユーザー直送）。省略時は通常配送。
    deliveryMethod: z.enum(["NORMAL", "DIRECT_TO_USER"]).default("NORMAL"),
    // エンドユーザー（最終需要家）— ユーザー直送では必須（headerRefsError で強制）
    endUserBpId: z.string().nullable().optional(),
    // 担当拠点（任意）
    assignedPlantId: z.number().int().positive().nullable().optional(),
    // 出荷作業場所（作業場所マスタ MS0D。任意）
    shippingWorkLocationId: z.number().int().positive().nullable().optional(),
    customerOrderRef: z.string().nullable(),
    // 参照する見積書番号 QOT-YYYYMM-NNNNN（任意 — P2-2 トレーサビリティ）
    quoteNumber: z.string().nullable().optional(),
    orderDate: z.string().nullable(),
    notes: z.string().nullable(),
    items: z.array(itemInputSchema(tr)),
  });
}

function manualInputSchema(tr: Tr) {
  return draftInputSchema(tr).extend({
    customerBpId: z
      .string()
      .min(1, tr("sales.orderAcceptances.selectACustomer")),
    items: z
      .array(itemInputSchema(tr))
      .min(1, tr("common.addAtLeastOneLineItem")),
  });
}

export type OrderAcceptanceDraftInput = z.infer<
  ReturnType<typeof draftInputSchema>
>;
export type OrderAcceptanceManualInput = z.infer<
  ReturnType<typeof manualInputSchema>
>;

/** 見積書番号（QOT-…）→ 複合キー。空・不正は null。 */
function quoteKeyOf(quoteNumber: string | null | undefined) {
  const trimmed = quoteNumber?.trim();
  if (!trimmed) return { quoteYearMonth: null, quoteSeq: null };
  const k = parseDocKey(trimmed, "QOT");
  return k
    ? { quoteYearMonth: k.yearMonth, quoteSeq: k.seq }
    : { quoteYearMonth: null, quoteSeq: null };
}

/**
 * ヘッダ参照（出荷先 / 担当拠点 / 出荷作業場所）の存在・有効チェック。
 * いずれも任意項目 — 指定されているものだけを検証し、問題があれば
 * エラーメッセージを返す（null = OK）。
 */
async function headerRefsError(
  tr: Tr,
  v: {
    shipToBpId?: string | null;
    deliveryMethod?: "NORMAL" | "DIRECT_TO_USER";
    endUserBpId?: string | null;
    assignedPlantId?: number | null;
    shippingWorkLocationId?: number | null;
  },
): Promise<string | null> {
  const shipToBpId = trimOrNull(v.shipToBpId);
  if (shipToBpId) {
    const bp = await prisma.businessPartner.findUnique({
      where: { id: shipToBpId },
      select: { isActive: true },
    });
    if (!bp?.isActive) return tr("sales.orderAcceptanceActions.shipToInvalid");
  }
  // ユーザー直送は届け先（エンドユーザー）が無いと出荷・納品書まで進めない。
  const endUserBpId = trimOrNull(v.endUserBpId);
  if (v.deliveryMethod === "DIRECT_TO_USER" && !endUserBpId) {
    return tr("sales.orderAcceptanceActions.directToUserRequiresEndUser");
  }
  if (endUserBpId) {
    const bp = await prisma.businessPartner.findUnique({
      where: { id: endUserBpId },
      select: { isActive: true },
    });
    if (!bp?.isActive) return tr("sales.orderAcceptanceActions.endUserInvalid");
  }
  if (v.assignedPlantId != null) {
    const plant = await prisma.plant.findUnique({
      where: { id: v.assignedPlantId },
      select: { isActive: true },
    });
    if (!plant?.isActive)
      return tr("sales.orderAcceptanceActions.assignedPlantInvalid");
  }
  if (v.shippingWorkLocationId != null) {
    const loc = await prisma.workLocation.findUnique({
      where: { id: v.shippingWorkLocationId },
      include: { group: { select: { isActive: true } } },
    });
    if (!loc?.isActive || !loc.group.isActive) {
      return tr("sales.orderAcceptanceActions.shippingWorkLocationInvalid");
    }
  }
  return null;
}

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

/**
 * 抽出失敗した IMPORT 行の再抽出。
 *
 * **待ち行列へ積んで即戻る** — 抽出は数分かかることがあり、Server Action で
 * 待つと画面が固まるうえ、優先取込の抽出と同時に po-extract を叩いてしまう
 * （GPU は 1 件ずつ）。結果は行の状態（取込中 → 下書き / 抽出失敗）で見る。
 */
export async function retryExtraction(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "IMPORT") {
      return actionError(
        tr("sales.orderAcceptanceActions.onlyImportCanRetryExtraction"),
      );
    }
    // 前回のエラー表示を消してから積む（画面上は「取込中」に戻る）。
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { extractError: null },
    });
    enqueueExtraction(key);
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.retryExtractionFailed"),
        tr,
      ),
    );
  }
}

/**
 * 抽出を待たずに手入力へ切り替える（IMPORT → DRAFT）。
 *
 * 抽出は数分かかることがあり、失敗して止まることもある。待てないときや
 * 内容が分かっているときは、人がその場で引き取れるようにする。
 * 裏で走っている抽出は**結果を捨てる**（runExtraction が IMPORT 以外なら
 * 書き込まない）ので、切り替えたあとの入力が消えることはない。
 */
export async function takeOverManually(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "IMPORT") {
      return actionError(
        tr("sales.orderAcceptanceActions.onlyImportCanTakeOverManually"),
      );
    }
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      // 抽出済みの値があればそれを残したまま編集させる（0 からとは限らない）。
      data: { status: "DRAFT", extractError: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "IMPORT" },
      after: {
        status: "DRAFT",
        note: tr("sales.orderAcceptanceActions.takenOverManually"),
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.takeOverFailed"),
        tr,
      ),
    );
  }
}

// ── 下書き保存（DRAFT のみ） ─────────────────────────────────────────────────

/** ヘッダ + 明細（全置換）を保存する。DRAFT のみ。 */
export async function saveDraft(
  number: string,
  payload: OrderAcceptanceDraftInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const parsed = draftInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  const v = parsed.data;
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        customerBpId: true,
        salesRepId: true,
        shipToBpId: true,
        deliveryMethod: true,
        endUserBpId: true,
        assignedPlantId: true,
        shippingWorkLocationId: true,
        customerOrderRef: true,
        orderDate: true,
        notes: true,
        // 学習（match_aliases）に使う: 抽出された社名と、保存前の突合状態。
        extracted: true,
        items: { select: { productId: true, productText: true } },
      },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    const refsError = await headerRefsError(tr, v);
    if (refsError) return actionError(refsError);
    const creates = buildItemCreates(v.items);
    const customerBpId = trimOrNull(v.customerBpId);
    const shipToBpId = trimOrNull(v.shipToBpId);
    // エンドユーザーは配送方法に依らず保持できる（直送では必須 —
    // headerRefsError。通常配送でも記録用に任意で持てる）。
    const endUserBpId = trimOrNull(v.endUserBpId);
    const assignedPlantId = v.assignedPlantId ?? null;
    const shippingWorkLocationId = v.shippingWorkLocationId ?? null;
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      customerBpId,
      prior.customerBpId,
    );
    let blocked: string | null = null;
    await prisma.$transaction(async (tx) => {
      // ラインチェック: 確定済みの明細は変更させない。tx 内で読むことで
      // 判定と削除の間に確定が割り込むのを防ぐ（判定は order-line-core に集約）。
      const lines = await tx.orderLine.findMany({
        where: { acceptanceYearMonth: key.yearMonth, acceptanceSeq: key.seq },
        select: { status: true, branch: true, isLocked: true },
      });
      blocked = linesReplaceBlockReason(prior.status, lines);
      if (blocked) return;
      await tx.orderLine.deleteMany({
        where: { acceptanceYearMonth: key.yearMonth, acceptanceSeq: key.seq },
      });
      await tx.orderAcceptance.update({
        where: { yearMonth_seq: key },
        data: {
          customerBpId,
          salesRepId,
          shipToBpId,
          deliveryMethod: v.deliveryMethod,
          endUserBpId,
          assignedPlantId,
          shippingWorkLocationId,
          customerOrderRef: trimOrNull(v.customerOrderRef),
          ...quoteKeyOf(v.quoteNumber),
          orderDate: v.orderDate ? new Date(v.orderDate) : null,
          notes: trimOrNull(v.notes),
          items: { create: creates },
        },
      });
    });
    if (blocked) return actionError(blocked);
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: {
        customerBpId: prior.customerBpId,
        salesRepId: prior.salesRepId,
        shipToBpId: prior.shipToBpId,
        deliveryMethod: prior.deliveryMethod,
        endUserBpId: prior.endUserBpId,
        assignedPlantId: prior.assignedPlantId,
        shippingWorkLocationId: prior.shippingWorkLocationId,
        customerOrderRef: prior.customerOrderRef,
        orderDate: prior.orderDate?.toISOString().slice(0, 10) ?? null,
        notes: prior.notes,
      },
      after: {
        customerBpId,
        salesRepId,
        shipToBpId,
        deliveryMethod: v.deliveryMethod,
        endUserBpId,
        assignedPlantId,
        shippingWorkLocationId,
        customerOrderRef: trimOrNull(v.customerOrderRef),
        orderDate: v.orderDate,
        notes: trimOrNull(v.notes),
        itemCount: creates.length,
      },
    });

    // 人が手で結び付けた「印字された表記 → マスタ」を覚える（次の取込で効く）。
    // 保存そのものは終わっている — 学習で失敗しても書類は保存済みのまま。
    await saveAliasLearnings(
      aliasLearnings({
        extractedCustomerName: normalizeExtraction(prior.extracted)
          .customerName,
        customer: { before: prior.customerBpId, after: customerBpId },
        items: {
          before: prior.items.map((it) => ({
            productText: it.productText,
            productId: it.productId != null ? String(it.productId) : null,
          })),
          after: v.items.map((it) => ({
            productText: it.productText,
            productId: trimOrNull(it.productId),
          })),
        },
      }),
      authz.userId,
    );

    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.saveDraftFailed"),
        tr,
      ),
    );
  }
}

// ── 承認フロー ───────────────────────────────────────────────────────────────

/**
 * 承認依頼 — DRAFT → REQUESTED（確定と同じ完成条件が要る: 顧客特定 +
 * 明細 1 件以上 + 全行の製品特定・単価入力 — lib/order-acceptance-readiness）。
 *
 * §2 価格照合（監査 P0-8）: 明細単価を価格表と突合し、差異がある場合は
 * `acknowledgePriceDiff: true`（UI の確認モーダル経由）なしには依頼できない。
 * 確認済みで依頼したときは監査ログに差異内容を残す。
 */
export async function submitForApproval(
  number: string,
  acknowledgePriceDiff = false,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: {
        status: true,
        customerBpId: true,
        deliveryMethod: true,
        endUserBpId: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: { productId: true, unitPrice: true },
        },
      },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "DRAFT") {
      return actionError(
        tr("sales.orderAcceptanceActions.onlyDraftCanRequestApproval"),
      );
    }
    // 確定と同じ完成条件を入口で確かめる（lib/order-acceptance-readiness）。
    // 画面のボタンも同じ判定で押せなくなっているので、ここに来るのは
    // 古い画面からの依頼だけ。
    const readiness = acceptanceReadiness(
      {
        customerBpId: prior.customerBpId,
        deliveryMethod: prior.deliveryMethod,
        endUserBpId: prior.endUserBpId,
        items: prior.items.map((it) => ({
          productId: it.productId,
          unitPrice: it.unitPrice == null ? null : Number(it.unitPrice),
        })),
      },
      tr,
    );
    if (!readiness.ok) {
      return actionError(
        tr("sales.orderAcceptanceActions.readinessIssues", {
          summary: readinessSummary(readiness.issues, tr),
        }),
      );
    }
    // 価格照合はサーバー側で必ず再計算する（クライアント表示値は信用しない）。
    const priceCheck = await checkAcceptancePrices(key);
    const diffLines = priceDiffSummary(priceCheck, tr);
    if (priceCheck.diffCount > 0 && !acknowledgePriceDiff) {
      return actionError(
        tr("sales.orderAcceptanceActions.priceDiffFound", {
          diffs: diffLines.join(" / "),
        }),
      );
    }
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("order_acceptances");
    if (flowError) return actionError(flowError);
    await prisma.orderAcceptance.update({
      where: { yearMonth_seq: key },
      data: { status: "REQUESTED" },
    });
    // 1 段目の承認依頼を作る（PD03 横断表示・承認記録の紐付け先）。
    const started = await startApprovalFlow({
      targetType: "order_acceptances",
      targetId: number,
    });
    if (!started.ok)
      return actionError(started.error ?? tr("common.approvalRequestFailed"));
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      before: { status: "DRAFT" },
      after: {
        status: "REQUESTED",
        ...(priceCheck.diffCount > 0
          ? {
              note: tr(
                "sales.orderAcceptanceActions.priceDiffAcknowledgedNote",
                {
                  count: priceCheck.diffCount,
                },
              ),
              priceDiffs: diffLines,
            }
          : {}),
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.approvalRequestFailed"), tr),
    );
  }
}

/** 承認 — 現在の段に承認を記録し、全段通過で APPROVED。 */
export async function approveAcceptance(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkApprovalDocAccess("order_acceptance");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "REQUESTED") {
      return actionError(tr("sales.orderAcceptanceActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "order_acceptances",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(acted.error ?? tr("common.noApprovalPermission"));
    // 全段を通過して初めて APPROVED。途中の段は REQUESTED のまま進む。
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "order_acceptances",
        recordId: number,
        after: {
          note: acted.stepClosed
            ? tr("common.approvalNextStep")
            : tr("common.approvalRemainingMembers", {
                count: acted.remaining,
              }),
        },
      });
      revalidate(number);
      return actionOk();
    }
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
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — REQUESTED → DRAFT（理由必須）。 */
export async function rejectAcceptance(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const authz = await checkApprovalDocAccess("order_acceptance");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      select: { status: true },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "REQUESTED") {
      return actionError(tr("sales.orderAcceptanceActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "order_acceptances",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.noSendBackPermission"));
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
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}

// ── 注文確定（APPROVED → COMPLETED） ────────────────────────────────────────

/**
 * 注文確定 — 明細ごとに注文明細（order_lines）を作成する。
 * 注文請書と同じ (year_month, seq) を共有し、枝番 branch = 1..N。
 * 全明細が製品特定済み + 単価入力済みであることが必要。
 */
export async function confirmOrderLines(
  number: string,
): Promise<ActionResult<{ numbers: string[] }>> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  const onlyApprovedCanConfirm = tr(
    "sales.orderAcceptanceActions.onlyApprovedCanConfirm",
  );
  try {
    const prior = await prisma.orderAcceptance.findUnique({
      where: { yearMonth_seq: key },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!prior)
      return actionError(tr("sales.orderAcceptanceActions.targetNotFound"));
    if (prior.status !== "APPROVED") {
      return actionError(onlyApprovedCanConfirm);
    }
    // 承認依頼と同じ完成条件（lib/order-acceptance-readiness）。通常は
    // 依頼の時点で満たされているが、承認中に明細が壊れる筋道が無いとは
    // 言い切れないので確定の直前にも確かめる。
    const readiness = acceptanceReadiness(
      {
        customerBpId: prior.customerBpId,
        deliveryMethod: prior.deliveryMethod,
        endUserBpId: prior.endUserBpId,
        items: prior.items.map((it) => ({
          productId: it.productId,
          unitPrice: it.unitPrice == null ? null : Number(it.unitPrice),
        })),
      },
      tr,
    );
    if (!readiness.ok) {
      return actionError(
        tr("sales.orderAcceptanceActions.confirmIssues", {
          summary: readinessSummary(readiness.issues, tr),
        }),
      );
    }

    const completedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // 二重確定ガード — APPROVED の行だけを原子的に COMPLETED へ。
      const updated = await tx.orderAcceptance.updateMany({
        where: { ...key, status: "APPROVED" },
        data: { status: "COMPLETED", completedAt },
      });
      if (updated.count === 0) {
        throw new Error(onlyApprovedCanConfirm);
      }
      // 明細行はすでに存在する — 確定は「枝番の採番 + 金額の凍結」だけ。
      // sortOrder 順に 1..N。以後 branch は不変（公開番号 ORD-…-NN の一部）。
      const branches = nextBranches(0, prior.items.length);
      for (const [i, it] of prior.items.entries()) {
        await tx.orderLine.update({
          where: { id: it.id },
          data: {
            branch: branches[i],
            status: "CONFIRMED",
            confirmedAt: completedAt,
            // 金額はサーバー側で計算し、この時点で凍結する。
            amount: it.quantity * Number(it.unitPrice),
          },
        });
      }
      // 参照元の見積書の状態は変えない（ACCEPTED は廃止 — 受諾したかどうかは
      // この注文請書自体が下流の「次の書類へ」として見積詳細に出る）。
    });

    const numbers = prior.items.map((_, i) =>
      formatOrderLineNumber({ ...key, branch: i + 1 }),
    );
    for (const [i, it] of prior.items.entries()) {
      await recordAudit({
        action: "CREATE",
        tableName: "order_lines",
        recordId: numbers[i],
        after: {
          note: tr("sales.orderAcceptanceActions.orderLineConfirmedNote", {
            number,
          }),
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
      after: { status: "COMPLETED", orderLines: numbers },
    });
    revalidate(number);
    revalidatePath(SALES_ORDERS_PATH);
    return actionOk({ numbers });
  } catch (e) {
    if (e instanceof Error && e.message === onlyApprovedCanConfirm) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.confirmFailed"),
        tr,
      ),
    );
  }
}

/** アーカイブ — COMPLETED → ARCHIVED。 */
export async function archiveAcceptance(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const updated = await prisma.orderAcceptance.updateMany({
      where: { ...key, status: "COMPLETED" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError(
        tr("sales.orderAcceptanceActions.onlyCompletedCanArchive"),
      );
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.archiveFailed"),
        tr,
      ),
    );
  }
}

// ── 手入力作成（MANUAL） ─────────────────────────────────────────────────────

/** 手入力の注文請書を DRAFT で作成する（source = MANUAL）。 */
export async function createManualAcceptance(
  payload: OrderAcceptanceManualInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const parsed = manualInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("order_acceptance", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const refsError = await headerRefsError(tr, v);
    if (refsError) return actionError(refsError);
    const shipToBpId = trimOrNull(v.shipToBpId);
    // エンドユーザーは配送方法に依らず保持できる（直送では必須）。
    const endUserBpId = trimOrNull(v.endUserBpId);
    const assignedPlantId = v.assignedPlantId ?? null;
    const shippingWorkLocationId = v.shippingWorkLocationId ?? null;
    const actor = await getCurrentActorId();
    const { yearMonth, seq } = await allocateDocumentKey("ORDER");
    const number = `ORD-${yearMonth}-${String(seq).padStart(5, "0")}`;
    // 新規は必ず顧客が変わる（prior = null）ので、未指定なら主担当が入る。
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      null,
    );
    await prisma.orderAcceptance.create({
      data: {
        yearMonth,
        seq,
        status: "DRAFT",
        source: "MANUAL",
        customerBpId: v.customerBpId,
        salesRepId,
        shipToBpId,
        deliveryMethod: v.deliveryMethod,
        endUserBpId,
        assignedPlantId,
        shippingWorkLocationId,
        customerOrderRef: trimOrNull(v.customerOrderRef),
        ...quoteKeyOf(v.quoteNumber),
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
        note: tr("sales.orderAcceptanceActions.createdManually"),
        customerBpId: v.customerBpId,
        salesRepId,
        shipToBpId,
        deliveryMethod: v.deliveryMethod,
        endUserBpId,
        assignedPlantId,
        shippingWorkLocationId,
        itemCount: v.items.length,
        status: "DRAFT",
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.createFailed"),
        tr,
      ),
    );
  }
}

// ── 注文請書キャンセル（承認フロー） ────────────────────────────────────────
//
// 確定済み（COMPLETED）の注文請書は明細単位ではキャンセルできない。
// キャンセルは注文請書ごと依頼し、承認設定（MS0B）の「注文請書キャンセル」
// フローを通す（1 段も無ければ即適用）。対象は依頼行
// （order_acceptance_cancel_requests の id）。実体は lib/order-acceptance-cancel.ts。

/** キャンセル依頼 — 承認設定があれば保留、無ければ即適用。理由必須。 */
export async function requestAcceptanceCancel(
  number: string,
  reason: string,
): Promise<ActionResult<{ pending: boolean }>> {
  const tr = await getTranslations();
  const key = keyOf(number);
  if (!key)
    return actionError(tr("sales.orderAcceptanceActions.invalidNumber"));
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const result = await submitAcceptanceCancelRequest({ key, reason });
    if (!result.ok) {
      return actionError(
        result.errors?.join(" / ") ??
          tr("sales.orderAcceptanceActions.cancelRequestFailed"),
      );
    }
    revalidate(number);
    revalidatePath(SALES_ORDERS_PATH);
    return actionOk({ pending: result.pending ?? false });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.orderAcceptanceActions.cancelRequestSubmitFailed"),
        tr,
      ),
    );
  }
}

/** キャンセル依頼を承認する。最終承認なら、その場でキャンセルを適用する。 */
export async function approveAcceptanceCancel(
  requestId: string,
): Promise<ActionResult<{ completed: boolean; applied: boolean }>> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("order_acceptance");
  if (!authz.ok) return actionError(authz.error);
  const row = await prisma.orderAcceptanceCancelRequest.findUnique({
    where: { id: requestId },
    select: { status: true, acceptanceYearMonth: true, acceptanceSeq: true },
  });
  if (!row)
    return actionError(
      tr("sales.orderAcceptanceActions.targetCancelRequestNotFound"),
    );
  if (row.status !== "PENDING") {
    return actionError(
      tr("sales.orderAcceptanceActions.cancelRequestNotPending"),
    );
  }
  const key = { yearMonth: row.acceptanceYearMonth, seq: row.acceptanceSeq };
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "order_acceptance_cancel_requests",
      targetId: requestId,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(acted.error ?? tr("common.noApprovalPermission"));

    const number = formatDocNumber("ORD", key);
    if (!acted.flowCompleted) {
      revalidate(number);
      return actionOk({ completed: false, applied: false });
    }

    // 最終承認 — ここで初めてキャンセルを当てる（承認依頼中の間に前提が変わって
    // いれば同じ検証で弾かれ、FAILED として残る）。
    const applied = await applyApprovedAcceptanceCancel(requestId);
    revalidate(number);
    revalidatePath(SALES_ORDERS_PATH);
    if (!applied.ok) {
      return actionError(
        applied.errors?.join(" / ") ??
          tr("sales.orderAcceptanceActions.cancelApplyFailed"),
      );
    }
    return actionOk({ completed: true, applied: true });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** キャンセル依頼を差し戻す（注文請書は変わらないまま閉じる）。 */
export async function rejectAcceptanceCancel(
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("order_acceptance");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const row = await prisma.orderAcceptanceCancelRequest.findUnique({
    where: { id: requestId },
    select: { status: true, acceptanceYearMonth: true, acceptanceSeq: true },
  });
  if (!row)
    return actionError(
      tr("sales.orderAcceptanceActions.targetCancelRequestNotFound"),
    );
  if (row.status !== "PENDING") {
    return actionError(
      tr("sales.orderAcceptanceActions.cancelRequestNotPending"),
    );
  }
  const key = { yearMonth: row.acceptanceYearMonth, seq: row.acceptanceSeq };
  if (!(await acceptanceInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.orderAcceptanceActions.scopeDenied"));
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "order_acceptance_cancel_requests",
      targetId: requestId,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.noSendBackPermission"));
    }
    await closeAcceptanceCancelRequest(requestId, "REJECTED");
    const number = formatDocNumber("ORD", key);
    await recordAudit({
      action: "UPDATE",
      tableName: "order_acceptances",
      recordId: number,
      after: {
        note: tr("sales.orderAcceptanceActions.cancelRequestRejectedNote", {
          reason: trimmed,
        }),
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}
