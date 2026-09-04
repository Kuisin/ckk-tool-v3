"use server";

/**
 * Server Actions — 設計依頼書 (app.design_requests, SA06)。
 *
 * - 採番: nextDocumentNumber("DESIGN") → DSG-YYYYMM-NNNNN（文字列保存、月次
 *   リセット）。URL id も依頼番号。
 * - トリガ（見積時/受注時/単独）と参照元（見積書/注文明細）は作成後変更不可。
 *   単独は見積にも受注にも紐づかない起票（新製品の検討・客先からの事前相談・
 *   社内の改善）で、参照元を両方 null にする。
 * - **製品は必須**。依頼区分（新規/改訂）を「その製品に design_files があるか」で
 *   自動判定するため。判定は detectDesignKind の 1 箇所だけが持ち、作成時と、
 *   編集できるあいだの製品変更時に走る。結果は保存する（導出しない）— 区分は
 *   承認ルートを決めるので、他の依頼が先に完了したときに値が動くと承認済みの
 *   ルートと食い違う。人が上書きしたら kindOverridden を立てて尊重する。
 * - 承認フロー DRAFT→REQUESTED→PENDING（+REJECTED / CANCELLED）は購買依頼と
 *   同型の row-workflow: 遷移列（at/by）+ history Json + audit。承認依頼・記録は
 *   approval_requests / approval_records へ正規化する（targetType
 *   "design_requests" — CM01 横断表示・代理対応）。
 * - 作業軸 PENDING→着手→IN_PROGRESS→完了→COMPLETED。**図面の登録はここでは
 *   行わない** — 版は 設計図 (PD06) が持つ。完了できるのは、この依頼に紐づく
 *   版 (design_files.design_request_id) が 1 件以上あるときだけ。
 * - COMPLETED → IN_PROGRESS の「差し戻し」は**作業の巻き戻し**であって承認軸では
 *   ないので、REJECTED には落とさず承認記録にも触らない。
 * - 遷移・更新は status を where に含めた updateMany で原子的にガードする。
 * - 通知は best-effort（notifySafe）— 失敗しても業務パスは止めない。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  actOnCurrentStep,
  appendHistory,
  assertFlowConfigured,
  type HistoryEntry,
  startApprovalFlow,
} from "@/lib/approvals";
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

const triggerEnum = z.enum(["QUOTE", "SALES_ORDER", "STANDALONE"]);

const kindEnum = z.enum(["NEW", "REVISION"]);
const priorityEnum = z.enum(["NORMAL", "HIGH"]);

/** 作成・更新で共通の項目（トリガと参照元だけが作成時限定）。 */
function commonInputShape(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return {
    /** 製品は必須 — 依頼区分の自動判定に要る。 */
    productId: z.string().min(1, tr("common.selectAProduct")),
    /**
     * 対象の受注元。完成した版がどの系列に載るかを決める。
     * null = 汎用（どの顧客の指示書からも使える）。
     * 見積・受注から起票したときはその顧客が既定になる。
     */
    customerBpId: z.string().nullable(),
    /** 図面をつくる製造担当（必須 — §10 の「依頼通知を製造担当へ」の宛先）。 */
    assigneeId: z
      .string()
      .min(1, tr("sales.designRequestForm.selectAnAssignee")),
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
}

function createInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    trigger: triggerEnum,
    /** 見積時: 見積書番号 QOT-YYYYMM-NNNNN（任意）。 */
    quoteNumber: z.string().nullable(),
    /** 受注時: 注文明細 uuid（任意）。 */
    orderLineId: z.string().nullable(),
    ...commonInputShape(tr),
  });
}

function updateInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({ ...commonInputShape(tr) });
}

export type DesignRequestCreateInput = z.infer<
  ReturnType<typeof createInputSchema>
>;
export type DesignRequestUpdateInput = z.infer<
  ReturnType<typeof updateInputSchema>
>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  // 承認依頼は未処理一覧 (CM01) にも横断表示される。
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
async function detectDesignKind(
  productId: number,
  customerBpId: string | null = null,
): Promise<{
  kind: "NEW" | "REVISION";
  versionCount: number;
  latestFileId: string | null;
}> {
  // 版は (製品 × 受注元) ごとの系列なので、区分もその系列だけを見て決める。
  // 「顧客 A には図面があるが B にはまだ無い」は B から見れば**新規**で、
  // 製品全体で数えると改訂に見えてしまう。
  const where = { productId, customerBpId };
  const [versionCount, latest] = await Promise.all([
    prisma.designFile.count({ where }),
    prisma.designFile.findFirst({
      where: { ...where, isLatest: true },
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
  tr: Awaited<ReturnType<typeof getTranslations>>,
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
    return {
      error: tr("sales.designRequestActions.changeReasonRequiredForRevision"),
    };
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
    // i18n-ignore — 開発者向けサーバーログ（画面には出ない）
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
export async function fetchKindContextAction(
  productId: string,
  customerBpId: string | null = null,
) {
  const authz = await checkPermission("design_request", "READ");
  if (!authz.ok) return null;
  const { fetchDesignKindContext } = await import("./data");
  return fetchDesignKindContext(productId, customerBpId);
}

// ── 作成 / 更新 ──────────────────────────────────────────────────────────────

/** 作成 — 採番して DRAFT で登録。作成後は詳細ページへ遷移する。 */
export async function createDesignRequest(
  payload: DesignRequestCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  // 参照元はトリガに対応する側のみ採用する（もう一方は常に null）。
  // 単独 (STANDALONE) はどちらも持たないので両方 null になる。
  const quoteNumber = v.trigger === "QUOTE" ? trimOrNull(v.quoteNumber) : null;
  const quoteKey = quoteNumber ? parseDocKey(quoteNumber, "QOT") : null;
  if (quoteNumber && !quoteKey) {
    return actionError(tr("sales.designRequestActions.invalidQuoteNumber"));
  }
  const orderLineId =
    v.trigger === "SALES_ORDER" ? trimOrNull(v.orderLineId) : null;

  const productId = Number(v.productId);
  if (!Number.isInteger(productId))
    return actionError(tr("sales.designRequestActions.invalidProduct"));

  try {
    const actor = await getCurrentActorId();
    // 依頼区分は「その系列（製品 × 受注元）に過去の設計書があるか」で決める
    // （入力があれば上書き）。
    const customerBpId = trimOrNull(v.customerBpId);
    const detected = await detectDesignKind(productId, customerBpId);
    const resolved = resolveKindFields(v, detected, tr);
    if ("error" in resolved) return actionError(resolved.error);

    const requestNumber = await nextDocumentNumber("DESIGN");
    await prisma.designRequest.create({
      data: {
        requestNumber,
        trigger: v.trigger,
        quoteYearMonth: quoteKey?.yearMonth ?? null,
        quoteSeq: quoteKey?.seq ?? null,
        orderLineId,
        customerBpId,
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
      title: tr("sales.designRequestActions.assignedNotificationTitle", {
        number: requestNumber,
      }),
      message: tr("sales.designRequestActions.stillDraftMessage"),
      number: requestNumber,
    });
    revalidate();
    return actionOk({ number: requestNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.designRequestActions.createFailed"), tr),
    );
  }
}

/** 更新 — 下書き・差し戻しのみ（トリガ・参照元は変更不可）。 */
export async function updateDesignRequest(
  number: string,
  payload: DesignRequestUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const productId = Number(v.productId);
  if (!Number.isInteger(productId))
    return actionError(tr("sales.designRequestActions.invalidProduct"));
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
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
    // 製品や受注元が変われば区分を判定し直す。編集できるのは承認に出す前だけ
    // なので、ここで動いても承認済みのルートと食い違わない。
    const customerBpId = trimOrNull(v.customerBpId);
    const detected = await detectDesignKind(productId, customerBpId);
    const resolved = resolveKindFields(v, detected, tr);
    if ("error" in resolved) return actionError(resolved.error);
    // status を where に含めた updateMany で原子的にガードする。
    const updated = await prisma.designRequest.updateMany({
      where: {
        requestNumber: number,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      data: {
        productId,
        customerBpId,
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
      return actionError(
        tr("sales.designRequestActions.onlyDraftOrRejectedCanBeEdited"),
      );
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
        title: tr("sales.designRequestActions.assignedNotificationTitle", {
          number,
        }),
        number,
      });
    }
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.designRequestActions.updateFailed"), tr),
    );
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
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!assigneeId.trim())
    return actionError(tr("sales.designRequestForm.selectAnAssignee"));
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { assigneeId: true, history: true },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
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
      return actionError(
        tr(
          "sales.designRequestActions.onlyApprovedOrInProgressCanChangeAssignee",
        ),
      );
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
      title: tr("sales.designRequestActions.assignedNotificationTitle", {
        number,
      }),
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.designRequestActions.assigneeChangeFailed"),
        tr,
      ),
    );
  }
}

// ── 状態遷移（承認軸） ───────────────────────────────────────────────────────

/** 承認依頼 — DRAFT / REJECTED → REQUESTED。 */
export async function requestDesignApproval(
  number: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError(
        tr("sales.designRequestActions.onlyDraftOrRejectedCanRequestApproval"),
      );
    }
    const actor = await getCurrentActorId();
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("design_requests");
    if (flowError) return actionError(flowError);
    // 1 段目の承認依頼を作る（CM01 横断表示・承認記録の紐付け先 +
    // その段の承認グループへの自動通知）。
    // **状態より先に依頼を作る** — 逆順だと依頼の作成が失敗したとき、書類だけが
    // 承認依頼中のまま誰の承認一覧にも出ない。依頼だけが残った側は
    // startApprovalFlow が二重依頼を成功として吸収するので、再依頼で追いつく。
    const started = await startApprovalFlow({
      targetType: "design_requests",
      targetId: number,
    });
    if (!started.ok) {
      return actionError(
        started.error ?? tr("sales.designRequestActions.approvalRequestFailed"),
      );
    }
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.designRequestActions.approvalRequestFailed"),
        tr,
      ),
    );
  }
}

/** 承認 — 現在の段に承認を記録し、全段通過で PENDING（承認済・着手待ち）。 */
export async function approveDesign(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  // 承認グループ所属（本人 or 代理）は引き続き actOnCurrentStep 内で検証する。
  const authz = await checkApprovalDocAccess("design_request");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
    if (prior.status !== "REQUESTED") {
      return actionError(tr("sales.designRequestActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "design_requests",
      targetId: number,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(
        acted.error ?? tr("sales.designRequestActions.noApprovePermission"),
      );
    const actor = await getCurrentActorId();
    // 全段を通過して初めて PENDING。途中の段は REQUESTED のまま進む。
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "design_requests",
        recordId: number,
        after: {
          note: acted.stepClosed
            ? tr("sales.designRequestActions.approvedToNextStep")
            : tr("sales.designRequestActions.approvedRemaining", {
                remaining: acted.remaining,
              }),
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
      title: tr("sales.designRequestActions.approvedNotificationTitle", {
        number,
      }),
      message: tr("sales.designRequestActions.pleaseStartMessage"),
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — REQUESTED → REJECTED（理由必須）。承認グループのメンバーのみ。 */
export async function rejectDesign(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("design_request");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
    if (prior.status !== "REQUESTED") {
      return actionError(tr("sales.designRequestActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "design_requests",
      targetId: number,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(
        acted.error ?? tr("sales.designRequestActions.noRejectPermission"),
      );
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
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}

/** キャンセル — 完了前のみ（理由必須）。承認依頼中なら依頼行も取り下げる。 */
export async function cancelDesign(
  number: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForCancelling"));
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
    if (prior.status === "COMPLETED" || prior.status === "CANCELLED") {
      return actionError(
        tr("sales.designRequestActions.onlyBeforeCompletionCanBeCancelled"),
      );
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
      title: tr("sales.designRequestActions.cancelledNotificationTitle", {
        number,
      }),
      message: trimmed,
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.designRequestActions.cancelFailed"), tr),
    );
  }
}

// ── 状態遷移（作業軸） ───────────────────────────────────────────────────────

/** 着手 (PENDING → IN_PROGRESS)。 */
export async function startDesign(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { createdBy: true, history: true },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
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
      return actionError(
        tr("sales.designRequestActions.onlyApprovedNotStartedCanStart"),
      );
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
      title: tr("sales.designRequestActions.startedNotificationTitle", {
        number,
      }),
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("sales.designRequestActions.startFailed"), tr),
    );
  }
}

/**
 * 完了 (IN_PROGRESS → COMPLETED)。completedAt を記録する。
 *
 * **図面はここでは登録しない。** 版の登録は 設計図 (PD06) が持つ — 依頼を
 * 経ない版もあるので、採番と is_latest の付け替えを依頼の完了処理に
 * ぶら下げると、入口が 2 つある処理の片方だけが正になってしまう。
 *
 * ただし成果物が無いまま完了はできない。**この依頼に紐づく版
 * (design_files.design_request_id) が 1 件以上あること**を条件にする。
 * これが無いと「完了」は状態を進めるだけの操作になり、依頼を出した側から
 * 見て何が出来たのか判らない。画面側は未登録のときに 設計図 の登録画面へ
 * 誘導する（DesignRequestDetail の ActionCard）。
 */
export async function completeDesign(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const request = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: {
        id: true,
        createdBy: true,
        history: true,
        kind: true,
        baseDesignFileId: true,
        quote: { select: { salesRepId: true } },
      },
    });
    if (!request) return actionError(tr("sales.designRequestActions.notFound"));

    // 成果物（この依頼から出来た版）。1 版に複数ファイルが載るので、
    // 版番号の種類数で「何版ぶんか」を数える。
    const produced = await prisma.designFile.findMany({
      where: { designRequestId: request.id },
      select: { version: true, role: true },
    });
    if (produced.length === 0) {
      return actionError(
        tr("sales.designRequestActions.noDesignFileRegistered"),
      );
    }
    const versions = [...new Set(produced.map((f) => f.version))];
    const versionsList = versions.map((v) => `v${v}`).join(", ");

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
                ? tr(
                    "sales.designRequestActions.baseVersionStaleAtCompletion",
                    {
                      version: staleBase.version,
                    },
                  )
                : undefined,
            ),
          ),
        ),
      },
    });
    if (updated.count === 0) {
      return actionError(
        tr("sales.designRequestActions.onlyInProgressCanComplete"),
      );
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "IN_PROGRESS" },
      after: {
        status: "COMPLETED",
        note: tr("sales.designRequestActions.deliverablesAudit", {
          count: produced.length,
          versions: versionsList,
        }),
        ...(staleBase ? { staleBaseVersion: staleBase.version } : {}),
      },
    });
    // §10「完了通知を営業・営業補助へ」— 依頼者と、見積起票なら見積の営業担当。
    await notifySafe({
      userIds: [request.createdBy, request.quote?.salesRepId],
      actor,
      type: "DESIGN",
      title: tr("sales.designRequestActions.completedNotificationTitle", {
        number,
      }),
      message: tr("sales.designRequestActions.completedNotificationMessage", {
        versions: versionsList,
        count: produced.length,
      }),
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("sales.designRequestActions.completeFailed"),
        tr,
      ),
    );
  }
}

/**
 * 差し戻し（作業） (COMPLETED → IN_PROGRESS)。completedAt をクリアする。
 *
 * 承認軸の差し戻し（REJECTED）とは別物 — 図面の描き直しであって、承認そのものを
 * やり直すわけではないので approval_requests / approval_records には触らない。
 */
export async function reopenDesign(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const actor = await getCurrentActorId();
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { assigneeId: true, history: true },
    });
    if (!prior) return actionError(tr("sales.designRequestActions.notFound"));
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
      return actionError(
        tr("sales.designRequestActions.onlyCompletedCanBeReopened"),
      );
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
      title: tr("sales.designRequestActions.reopenedNotificationTitle", {
        number,
      }),
      message: tr("sales.designRequestActions.pleaseReviseMessage"),
      number,
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}
