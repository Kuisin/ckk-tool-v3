"use server";

/**
 * Server Actions — 設計依頼書 (app.design_requests, SA06)。
 *
 * - 採番: nextDocumentNumber("DESIGN") → DSG-YYYYMM-NNNNN（文字列保存、月次
 *   リセット）。URL id も依頼番号。
 * - トリガ（見積時/受注時）と参照元（見積書/注文明細）は作成後変更不可。
 * - **製品は必須**。依頼区分（新規/改訂）を「その製品に design_files があるか」で
 *   自動判定するため。判定は detectDesignKind の 1 箇所だけが持ち、作成時と、
 *   編集できるあいだの製品変更時に走る。結果は保存する（導出しない）— 区分は
 *   承認ルートを決めるので、他の依頼が先に完了したときに値が動くと承認済みの
 *   ルートと食い違う。人が上書きしたら kindOverridden を立てて尊重する。
 * - 承認フロー DRAFT→REQUESTED→PENDING（+REJECTED / CANCELLED）は購買依頼と
 *   同型の row-workflow: 遷移列（at/by）+ history Json + audit。承認依頼・記録は
 *   approval_requests / approval_records へ正規化する（targetType
 *   "design_requests" — CM01 横断表示・代理対応）。
 * - 作業軸 PENDING→着手→IN_PROGRESS→完了→COMPLETED。完了は設計ファイルの添付が
 *   必須で、そのとき design_files へ版を登録する。
 * - COMPLETED → IN_PROGRESS の「差し戻し」は**作業の巻き戻し**であって承認軸では
 *   ないので、REJECTED には落とさず承認記録にも触らない。
 * - 遷移・更新は status を where に含めた updateMany で原子的にガードする。
 * - 通知は best-effort（notifySafe）— 失敗しても業務パスは止めない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actOnCurrentStep,
  appendHistory,
  assertFlowConfigured,
  type HistoryEntry,
  startApprovalFlow,
} from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { type NotificationType, notify } from "@/lib/notifications";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/design-requests";
const APPROVALS_PATH = "/general/tasks";

const triggerEnum = z.enum(["QUOTE", "SALES_ORDER"]);

const kindEnum = z.enum(["NEW", "REVISION"]);
const priorityEnum = z.enum(["NORMAL", "HIGH"]);

/** 作成・更新で共通の項目（トリガと参照元だけが作成時限定）。 */
const commonInput = {
  /** 製品は必須 — 依頼区分の自動判定に要る。 */
  productId: z.string().min(1, "製品を選択してください"),
  /** 図面をつくる製造担当（必須 — §10 の「依頼通知を製造担当へ」の宛先）。 */
  assigneeId: z.string().min(1, "担当者を選択してください"),
  description: z.string().nullable(),
  /** 区分の手動上書き。null = 自動判定に従う。 */
  kind: kindEnum.nullable(),
  /** 改訂の元図面（design_files.id）。null = 判定時の最新版。 */
  baseDesignFileId: z.string().nullable(),
  changeReason: z.string().nullable(),
  /** 希望納期 YYYY-MM-DD。 */
  desiredAt: z.string().nullable(),
  priority: priorityEnum,
};

const createInput = z.object({
  trigger: triggerEnum,
  /** 見積時: 見積書番号 QOT-YYYYMM-NNNNN（任意）。 */
  quoteNumber: z.string().nullable(),
  /** 受注時: 注文明細 uuid（任意）。 */
  orderLineId: z.string().nullable(),
  ...commonInput,
});

const updateInput = z.object({ ...commonInput });

export type DesignRequestCreateInput = z.infer<typeof createInput>;
export type DesignRequestUpdateInput = z.infer<typeof updateInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  // 承認依頼は承認・予定 (CM01) にも横断表示される。
  revalidatePath(APPROVALS_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

function entry(
  action: string,
  actor: string | null,
  notes?: string,
): HistoryEntry {
  return {
    action,
    user: actor,
    at: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  };
}

/** 履歴エントリ列を Prisma Json 入力型（index signature 付き）へ変換する。 */
function toHistoryJson(list: HistoryEntry[]): Record<string, string | null>[] {
  return list.map((e) => ({
    action: e.action,
    user: e.user,
    at: e.at,
    ...(e.notes ? { notes: e.notes } : {}),
  }));
}

/**
 * 依頼区分の自動判定 — 「その製品に過去の設計書（design_files）があるか」。
 *
 * completeDesign は完了時に必ず product_id 付きで版を作るので、この 1 表を見れば
 * 「過去に設計書があるか」は足りる。依頼を経ずに取り込んだ版も同じく数える。
 *
 * 作成時と、編集できるあいだの製品変更時にだけ呼ぶ。結果は保存する（画面表示の
 * たびに引き直すと、他の依頼が先に完了した瞬間に区分が変わってしまう）。
 */
async function detectDesignKind(productId: number): Promise<{
  kind: "NEW" | "REVISION";
  versionCount: number;
  latestFileId: string | null;
}> {
  const [versionCount, latest] = await Promise.all([
    prisma.designFile.count({ where: { productId } }),
    prisma.designFile.findFirst({
      where: { productId, isLatest: true },
      select: { id: true },
    }),
  ]);
  return {
    kind: versionCount > 0 ? "REVISION" : "NEW",
    versionCount,
    latestFileId: latest?.id ?? null,
  };
}

/**
 * 入力 + 自動判定 → 保存する区分まわりの値。
 * 改訂なのに変更理由が無ければエラー文字列を返す（呼び出し側で actionError）。
 */
function resolveKindFields(
  v: {
    kind: "NEW" | "REVISION" | null;
    baseDesignFileId: string | null;
    changeReason: string | null;
  },
  detected: Awaited<ReturnType<typeof detectDesignKind>>,
):
  | { error: string }
  | {
      kind: "NEW" | "REVISION";
      kindOverridden: boolean;
      baseDesignFileId: string | null;
      changeReason: string | null;
    } {
  const kind = v.kind ?? detected.kind;
  const changeReason = trimOrNull(v.changeReason);
  if (kind === "REVISION" && !changeReason) {
    return { error: "改訂のときは変更理由を入力してください" };
  }
  return {
    kind,
    kindOverridden: v.kind != null && v.kind !== detected.kind,
    // 改訂なら指定された元図面、無指定なら判定時点の最新版。新規は持たない。
    baseDesignFileId:
      kind === "REVISION"
        ? (trimOrNull(v.baseDesignFileId) ?? detected.latestFileId)
        : null,
    changeReason: kind === "REVISION" ? changeReason : null,
  };
}

/** 希望納期 YYYY-MM-DD → Date（空は null）。 */
function toDate(v: string | null | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 通知は業務の付帯物なので、失敗しても本体の遷移は成立させる。
 * 自分自身と重複は落とす（notify 側は actor を除外しない）。
 */
async function notifySafe(input: {
  userIds: (string | null | undefined)[];
  actor: string | null;
  type: NotificationType;
  title: string;
  message?: string | null;
  number: string;
}): Promise<void> {
  const userIds = [
    ...new Set(
      input.userIds.filter((u): u is string => Boolean(u) && u !== input.actor),
    ),
  ];
  if (userIds.length === 0) return;
  try {
    await notify({
      userIds,
      type: input.type,
      title: input.title,
      message: input.message ?? undefined,
      linkPath: `${BASE_PATH}/${encodeURIComponent(input.number)}`,
    });
  } catch (e) {
    console.error("[design-requests] 通知に失敗:", e);
  }
}

/**
 * 依頼区分の判定 + その製品の版一覧をフォームへ返す（読み取りだけ）。
 *
 * 判定規則をクライアントへ持ち出さないための口。画面は「いま何になるか」を
 * 出すだけで、**保存する値を決めるのは createDesignRequest / updateDesignRequest
 * の中の detectDesignKind**（画面の表示と保存が食い違っても、保存側が正）。
 */
export async function fetchKindContextAction(productId: string) {
  const authz = await checkPermission("design_request", "READ");
  if (!authz.ok) return null;
  const { fetchDesignKindContext } = await import("./data");
  return fetchDesignKindContext(productId);
}

// ── 作成 / 更新 ──────────────────────────────────────────────────────────────

/** 作成 — 採番して DRAFT で登録。作成後は詳細ページへ遷移する。 */
export async function createDesignRequest(
  payload: DesignRequestCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const authz = await checkPermission("design_request", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  // 参照元はトリガに対応する側のみ採用する（もう一方は常に null）。
  const quoteNumber = v.trigger === "QUOTE" ? trimOrNull(v.quoteNumber) : null;
  const quoteKey = quoteNumber ? parseDocKey(quoteNumber, "QOT") : null;
  if (quoteNumber && !quoteKey) {
    return actionError("見積書番号が不正です");
  }
  const orderLineId =
    v.trigger === "SALES_ORDER" ? trimOrNull(v.orderLineId) : null;

  const productId = Number(v.productId);
  if (!Number.isInteger(productId)) return actionError("製品が不正です");

  try {
    const actor = await getCurrentActorId();
    // 依頼区分は「その製品に過去の設計書があるか」で決める（入力があれば上書き）。
    const detected = await detectDesignKind(productId);
    const resolved = resolveKindFields(v, detected);
    if ("error" in resolved) return actionError(resolved.error);

    const requestNumber = await nextDocumentNumber("DESIGN");
    await prisma.designRequest.create({
      data: {
        requestNumber,
        trigger: v.trigger,
        quoteYearMonth: quoteKey?.yearMonth ?? null,
        quoteSeq: quoteKey?.seq ?? null,
        orderLineId,
        productId,
        assigneeId: v.assigneeId,
        description: trimOrNull(v.description),
        kind: resolved.kind,
        kindOverridden: resolved.kindOverridden,
        baseDesignFileId: resolved.baseDesignFileId,
        changeReason: resolved.changeReason,
        desiredAt: toDate(v.desiredAt),
        priority: v.priority,
        status: "DRAFT",
        createdBy: actor,
        history: toHistoryJson([entry("CREATE", actor)]),
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "design_requests",
      recordId: requestNumber,
      after: {
        trigger: v.trigger,
        quoteNumber,
        orderLineId,
        productId,
        assigneeId: v.assigneeId,
        description: trimOrNull(v.description),
        kind: resolved.kind,
        kindOverridden: resolved.kindOverridden,
        desiredAt: v.desiredAt,
        priority: v.priority,
        status: "DRAFT",
      },
    });
    await notifySafe({
      userIds: [v.assigneeId],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${requestNumber} の担当に指定されました`,
      message: "まだ下書きです。承認され次第、着手できます。",
      number: requestNumber,
    });
    revalidate();
    return actionOk({ number: requestNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設計依頼書の作成に失敗しました"));
  }
}

/** 更新 — 下書き・差し戻しのみ（トリガ・参照元は変更不可）。 */
export async function updateDesignRequest(
  number: string,
  payload: DesignRequestUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const productId = Number(v.productId);
  if (!Number.isInteger(productId)) return actionError("製品が不正です");
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: {
        productId: true,
        assigneeId: true,
        description: true,
        kind: true,
        history: true,
      },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    // 製品が変われば区分を判定し直す。編集できるのは承認に出す前だけなので、
    // ここで動いても承認済みのルートと食い違わない。
    const detected = await detectDesignKind(productId);
    const resolved = resolveKindFields(v, detected);
    if ("error" in resolved) return actionError(resolved.error);
    // status を where に含めた updateMany で原子的にガードする。
    const updated = await prisma.designRequest.updateMany({
      where: {
        requestNumber: number,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      data: {
        productId,
        assigneeId: v.assigneeId,
        description: trimOrNull(v.description),
        kind: resolved.kind,
        kindOverridden: resolved.kindOverridden,
        baseDesignFileId: resolved.baseDesignFileId,
        changeReason: resolved.changeReason,
        desiredAt: toDate(v.desiredAt),
        priority: v.priority,
        history: toHistoryJson(
          appendHistory(
            prior.history,
            entry(
              resolved.kind === prior.kind ? "UPDATE" : "KIND_OVERRIDE",
              actor,
            ),
          ),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError("下書き・差し戻しの設計依頼書のみ編集できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: {
        productId: prior.productId,
        assigneeId: prior.assigneeId,
        description: prior.description,
        kind: prior.kind,
      },
      after: {
        productId,
        assigneeId: v.assigneeId,
        description: trimOrNull(v.description),
        kind: resolved.kind,
        desiredAt: v.desiredAt,
        priority: v.priority,
      },
    });
    if (v.assigneeId !== prior.assigneeId) {
      await notifySafe({
        userIds: [v.assigneeId],
        actor,
        type: "DESIGN",
        title: `設計依頼 ${number} の担当に指定されました`,
        number,
      });
    }
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設計依頼書の更新に失敗しました"));
  }
}

/**
 * 担当者の付け替え — 承認済・進行中のみ。
 *
 * 承認の対象は「何を設計するか」であって「誰がつくるか」ではないので、
 * 承認後でも付け替えられる（フォーム全体の編集とは別のアクションに割る）。
 */
export async function setDesignAssignee(
  number: string,
  assigneeId: string,
): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!assigneeId.trim()) return actionError("担当者を選択してください");
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { assigneeId: true, history: true },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    const updated = await prisma.designRequest.updateMany({
      where: {
        requestNumber: number,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        assigneeId,
        history: toHistoryJson(
          appendHistory(prior.history, entry("ASSIGN", actor)),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError("承認済・進行中の設計依頼書のみ担当者を変更できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { assigneeId: prior.assigneeId },
      after: { assigneeId },
    });
    await notifySafe({
      userIds: [assigneeId],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} の担当に指定されました`,
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "担当者の変更に失敗しました"));
  }
}

// ── 状態遷移（承認軸） ───────────────────────────────────────────────────────

/** 承認依頼 — DRAFT / REJECTED → REQUESTED。 */
export async function requestDesignApproval(
  number: string,
): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError("下書き・差し戻しの設計依頼書のみ承認依頼できます");
    }
    const actor = await getCurrentActorId();
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("design_requests");
    if (flowError) return actionError(flowError);
    await prisma.designRequest.update({
      where: { id: prior.id },
      data: {
        status: "REQUESTED",
        requestedAt: new Date(),
        requestedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("REQUEST_APPROVAL", actor)),
        ),
      },
    });
    // 1 段目の承認依頼を作る（CM01 横断表示・承認記録の紐付け先 +
    // その段の承認グループへの自動通知）。
    const started = await startApprovalFlow({
      targetType: "design_requests",
      targetId: number,
    });
    if (!started.ok) {
      return actionError(started.error ?? "承認依頼に失敗しました");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: prior.status },
      after: { status: "REQUESTED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/** 承認 — 現在の段に承認を記録し、全段通過で PENDING（承認済・着手待ち）。 */
export async function approveDesign(number: string): Promise<ActionResult> {
  // 承認グループ所属（本人 or 代理）は引き続き actOnCurrentStep 内で検証する。
  const authz = await checkApprovalDocAccess("design_request");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の設計依頼書ではありません");
    }
    const acted = await actOnCurrentStep({
      targetType: "design_requests",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");
    const actor = await getCurrentActorId();
    // 全段を通過して初めて PENDING。途中の段は REQUESTED のまま進む。
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "design_requests",
        recordId: number,
        after: {
          note: acted.stepClosed
            ? "承認（次の段へ）"
            : `承認（この段の残り ${acted.remaining} 名）`,
        },
      });
      revalidate(number);
      return actionOk();
    }
    await prisma.designRequest.update({
      where: { id: prior.id },
      data: {
        status: "PENDING",
        approvedAt: new Date(),
        approvedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("APPROVE", actor)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "REQUESTED" },
      after: { status: "PENDING" },
    });
    // §10「依頼通知を製造担当へ」— 承認が通ってはじめて着手できるので、
    // 起票時ではなくここが実際の合図になる。
    await notifySafe({
      userIds: [prior.assigneeId],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} が承認されました`,
      message: "着手してください。",
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 差し戻し — REQUESTED → REJECTED（理由必須）。承認グループのメンバーのみ。 */
export async function rejectDesign(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkApprovalDocAccess("design_request");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の設計依頼書ではありません");
    }
    const acted = await actOnCurrentStep({
      targetType: "design_requests",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "差し戻しの権限がありません");
    }
    const actor = await getCurrentActorId();
    await prisma.designRequest.update({
      where: { id: prior.id },
      data: {
        status: "REJECTED",
        history: toHistoryJson(
          appendHistory(prior.history, entry("REJECT", actor, trimmed)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "REQUESTED" },
      after: { status: "REJECTED", rejectReason: trimmed },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}

/** キャンセル — 完了前のみ（理由必須）。承認依頼中なら依頼行も取り下げる。 */
export async function cancelDesign(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError("キャンセル理由を入力してください");
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    if (prior.status === "COMPLETED" || prior.status === "CANCELLED") {
      return actionError("完了前の設計依頼書のみキャンセルできます");
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction([
      prisma.designRequest.update({
        where: { id: prior.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: actor,
          cancelReason: trimmed,
          history: toHistoryJson(
            appendHistory(prior.history, entry("CANCEL", actor, trimmed)),
          ),
        },
      }),
      // 承認依頼中のキャンセル: 未処理の承認依頼行を取り下げる
      // （記録なしの PENDING 行のみ — CM01 の横断一覧に残さない）。
      prisma.approvalRequest.deleteMany({
        where: {
          targetType: "design_requests",
          targetId: number,
          status: "PENDING",
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: prior.status },
      after: { status: "CANCELLED", cancelReason: trimmed },
    });
    await notifySafe({
      userIds: [prior.assigneeId, prior.createdBy],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} がキャンセルされました`,
      message: trimmed,
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}

// ── 状態遷移（作業軸） ───────────────────────────────────────────────────────

/** 着手 (PENDING → IN_PROGRESS)。 */
export async function startDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { createdBy: true, history: true },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "PENDING" },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        history: toHistoryJson(
          appendHistory(prior.history, entry("START", actor)),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError("承認済（未着手）の設計依頼書のみ着手できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "PENDING" },
      after: { status: "IN_PROGRESS" },
    });
    await notifySafe({
      userIds: [prior.createdBy],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} の設計が始まりました`,
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "着手に失敗しました"));
  }
}

/** 完了 (IN_PROGRESS → COMPLETED)。completedAt を記録する。 */
export async function completeDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // 完了には設計ファイルの添付が必須（監査 P2-3 — dead-end 解消）
    const attachments = await listAttachments("design_requests", number);
    if (attachments.length === 0) {
      return actionError("設計ファイルを添付してから完了してください");
    }
    const latest = attachments[0]; // listAttachments は新しい順

    const request = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: {
        id: true,
        productId: true,
        createdBy: true,
        history: true,
        kind: true,
        baseDesignFileId: true,
        quote: { select: { salesRepId: true } },
      },
    });
    if (!request) return actionError("対象の設計依頼書が見つかりません");

    // 依頼中に別の改訂が先に完了していると、この依頼が基にした版はもう最新では
    // ない。止めはしない（描き直させても仕方がない）が、**黙って上書きさせない**
    // ために記録に残す。
    const staleBase =
      request.kind === "REVISION" && request.baseDesignFileId != null
        ? await prisma.designFile.findFirst({
            where: { id: request.baseDesignFileId, isLatest: false },
            select: { version: true },
          })
        : null;

    const actor = await getCurrentActorId();
    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "IN_PROGRESS" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: actor,
        history: toHistoryJson(
          appendHistory(
            request.history,
            entry(
              "COMPLETE",
              actor,
              staleBase
                ? `元図面 v${staleBase.version} は完了時点で最新ではありませんでした`
                : undefined,
            ),
          ),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError("進行中の設計依頼書のみ完了できます");
    }

    // design_files へバージョン登録し、製品マスタの最新設計を更新
    await prisma.$transaction(async (tx) => {
      const prev = await tx.designFile.aggregate({
        _max: { version: true },
        where: { designRequestId: request.id },
      });
      const version = (prev._max.version ?? 0) + 1;
      await tx.designFile.updateMany({
        where: { designRequestId: request.id, isLatest: true },
        data: { isLatest: false },
      });
      // 製品との紐付けは design_files.product_id + is_latest（製品側の
      // 最新設計は designFiles(isLatest) で参照する — カラム二重化しない）
      if (request.productId != null) {
        await tx.designFile.updateMany({
          where: { productId: request.productId, isLatest: true },
          data: { isLatest: false },
        });
      }
      await tx.designFile.create({
        data: {
          designRequestId: request.id,
          productId: request.productId,
          fileId: latest.fileId,
          version,
          isLatest: true,
          createdBy: actor,
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "IN_PROGRESS" },
      after: {
        status: "COMPLETED",
        note: `設計ファイル登録（${latest.filename}）${request.productId != null ? " + 製品の最新設計を更新" : ""}`,
        ...(staleBase ? { staleBaseVersion: staleBase.version } : {}),
      },
    });
    // §10「完了通知を営業・営業補助へ」— 依頼者と、見積起票なら見積の営業担当。
    await notifySafe({
      userIds: [request.createdBy, request.quote?.salesRepId],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} の図面ができました`,
      message: latest.filename,
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "完了に失敗しました"));
  }
}

/**
 * 差し戻し（作業） (COMPLETED → IN_PROGRESS)。completedAt をクリアする。
 *
 * 承認軸の差し戻し（REJECTED）とは別物 — 図面の描き直しであって、承認そのものを
 * やり直すわけではないので approval_requests / approval_records には触らない。
 */
export async function reopenDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { assigneeId: true, history: true },
    });
    if (!prior) return actionError("対象の設計依頼書が見つかりません");
    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "COMPLETED" },
      data: {
        status: "IN_PROGRESS",
        completedAt: null,
        completedBy: null,
        history: toHistoryJson(
          appendHistory(prior.history, entry("REOPEN", actor)),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError("完了済みの設計依頼書のみ差し戻しできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "COMPLETED" },
      after: { status: "IN_PROGRESS" },
    });
    await notifySafe({
      userIds: [prior.assigneeId],
      actor,
      type: "DESIGN",
      title: `設計依頼 ${number} が差し戻されました`,
      message: "図面を修正してください。",
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}
