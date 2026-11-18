"use server";

/**
 * Server Actions — 設計図の版 (PD06 / PD26 / 版の詳細)。
 *
 * 版を**作る**・ファイルを**足す**のは Route Handler の仕事
 * （/api/design-files/upload, /api/design-files/versions/[id]/files —
 * Server Action のボディは 1MB で頭打ちになり、図面は普通に超える）。
 * ここはファイルを伴わない操作:
 *
 *   - 仕様・メモの編集、ファイルの説明の編集、ファイルを外す（確定前のみ）
 *   - 下書きの版を消す（確定前のみ）
 *   - 確定 — 承認設定 (MS0B) に段があれば承認依頼、無ければその場で確定
 *   - 承認 / 差し戻し
 *
 * 可否の判定は lib/design-files-core が唯一の定義元で、**画面と同じ関数を
 * サーバー側でも通す**（UI のガードを飾りにしない）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  actOnCurrentStep,
  appendHistory,
  assertFlowConfigured,
  cancelApprovalFlow,
  type HistoryEntry,
  startApprovalFlow,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { confirmVersionInTx } from "@/lib/design-files";
import {
  canDeleteVersion,
  canSubmitVersion,
  describeVersionLock,
  isVersionEditable,
} from "@/lib/design-files-core";
import { validateVersionSpec, versionSpecSchema } from "@/lib/design-spec";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject } from "@/lib/storage";

const BASE_PATH = "/production/design-files";
const APPROVALS_PATH = "/general/tasks";

const uuid = z.string().uuid();

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

function historyJson(list: HistoryEntry[]): Prisma.InputJsonValue {
  return list.map((e) => ({
    action: e.action,
    user: e.user,
    at: e.at,
    ...(e.notes ? { notes: e.notes } : {}),
  }));
}

function revalidate(v: { id: string; itemId: number }) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${v.itemId}`);
  revalidatePath(`${BASE_PATH}/versions/${v.id}`);
  // 製品マスタ (MS24) は確定した版の仕様を表示する。
  revalidatePath(`/master/products/${v.itemId}`);
  revalidatePath(APPROVALS_PATH);
}

async function loadVersion(id: string) {
  if (!uuid.safeParse(id).success) return null;
  return prisma.designVersion.findUnique({
    where: { id },
    select: {
      id: true,
      itemId: true,
      customerBpId: true,
      version: true,
      status: true,
      history: true,
      createdAt: true,
    },
  });
}

/** 編集できないときの理由（編集できるなら null）。 */
async function lockError(status: Parameters<typeof isVersionEditable>[0]) {
  if (isVersionEditable(status)) return null;
  const tr = await getTranslations();
  return (
    describeVersionLock(status, tr) ??
    tr("production.designFileActions.cannotEdit")
  );
}

// ─── 編集（確定前のみ） ───────────────────────────────────────────────────────

/** 仕様・表題欄・メモを保存する。 */
export async function updateDesignVersion(
  id: string,
  input: z.input<typeof versionSpecSchema>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = versionSpecSchema.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  try {
    const v = await loadVersion(id);
    if (!v) return actionError(tr("production.designFileActions.notFound"));
    const locked = await lockError(v.status);
    if (locked) return actionError(locked);
    const spec = await validateVersionSpec(parsed.data);
    if (!spec.ok) return actionError(spec.error);
    const saved = await prisma.$transaction(async (tx) => {
      // 保存のあいだに確定されていたら書かない（確定した版を動かさない）。
      const fresh = await tx.designVersion.findFirst({
        where: { id: v.id, status: { in: ["DRAFT", "REJECTED"] } },
        select: { id: true },
      });
      if (!fresh) return false;
      await tx.designVersion.update({
        where: { id: v.id },
        data: {
          materialTypeId: spec.data.materialTypeId,
          diameterMm: spec.data.diameterMm,
          lengthMm: spec.data.lengthMm,
          // null = 消す。JSON 列は DbNull で書かないと「触らない」になる。
          spec: spec.data.spec ?? Prisma.DbNull,
          titleBlock: spec.data.titleBlock ?? Prisma.DbNull,
          extract:
            (spec.data.extract as Prisma.InputJsonValue | null) ??
            Prisma.DbNull,
          notes: spec.data.notes,
        },
      });
      return true;
    });
    if (!saved) {
      return actionError(tr("production.designFileActions.lockedConfirmed"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: v.id,
      after: {
        note: tr("production.designFileActions.specUpdatedAudit", {
          version: v.version,
        }),
        materialTypeId: spec.data.materialTypeId,
        diameterMm: spec.data.diameterMm,
        lengthMm: spec.data.lengthMm,
        spec: spec.data.spec,
        titleBlock: spec.data.titleBlock,
        overridden: spec.data.extract?.overridden ?? [],
      },
    });
    revalidate(v);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotUpdate"), tr));
  }
}

const notesInput = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

/** ファイル 1 枚の説明（参考資料の「何の図か」など）を直す。確定前のみ。 */
export async function updateDesignFileNotes(
  input: z.input<typeof notesInput>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = notesInput.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  try {
    const row = await prisma.designFile.findUnique({
      where: { id: parsed.data.id },
      select: {
        id: true,
        version: true,
        designVersion: { select: { id: true, itemId: true, status: true } },
      },
    });
    if (!row) return actionError(tr("production.designFileActions.notFound"));
    const locked = await lockError(row.designVersion.status);
    if (locked) return actionError(locked);
    await prisma.designFile.update({
      where: { id: row.id },
      data: { notes: parsed.data.notes?.trim() || null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_files",
      recordId: row.id,
      after: {
        note: tr("production.designFileActions.memoUpdatedAudit", {
          version: row.version,
        }),
      },
    });
    revalidate(row.designVersion);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotUpdate"), tr));
  }
}

/** 確定前の版からファイルを 1 枚外す（files 行と storage も消す）。 */
export async function deleteDesignFile(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!uuid.safeParse(id).success) {
    return actionError(tr("production.designFileActions.notFound"));
  }
  try {
    const row = await prisma.designFile.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        file: { select: { id: true, storageKey: true, filename: true } },
        designVersion: { select: { id: true, itemId: true, status: true } },
      },
    });
    if (!row) return actionError(tr("production.designFileActions.notFound"));
    const locked = await lockError(row.designVersion.status);
    if (locked) return actionError(locked);
    // 改訂依頼が「元図面」に指しているファイルは消せない（参照が切れる）。
    const referenced = await prisma.designRequest.count({
      where: { baseDesignFileId: row.id },
    });
    if (referenced > 0) {
      return actionError(
        tr("production.designFileActions.referencedByRevisionRequest"),
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.designFile.delete({ where: { id: row.id } });
      await tx.file.delete({ where: { id: row.file.id } });
    });
    // storage は best-effort（消し損ねてもデータの筋は通っている）。
    await deleteObject(row.file.storageKey);
    await recordAudit({
      action: "DELETE",
      tableName: "design_files",
      recordId: row.id,
      before: {
        note: tr("production.designFileActions.deletedAudit", {
          version: row.version,
        }),
        filename: row.file.filename,
      },
    });
    revalidate(row.designVersion);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotDelete"), tr));
  }
}

/**
 * 確定前の版を丸ごと消す（ファイルも）。確定した版は消せない — 指示書や改訂
 * 依頼が指しているかもしれず、番号の欠けた系列は「どこへ行ったのか」を
 * 説明できない。
 */
export async function deleteDesignVersion(
  id: string,
): Promise<ActionResult<{ itemId: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const v = await loadVersion(id);
    if (!v) return actionError(tr("production.designFileActions.notFound"));
    if (!canDeleteVersion(v.status)) {
      return actionError(
        describeVersionLock(v.status, tr) ??
          tr("production.designFileActions.cannotDelete"),
      );
    }
    const files = await prisma.designFile.findMany({
      where: { designVersionId: v.id },
      select: { id: true, file: { select: { id: true, storageKey: true } } },
    });
    const referenced = await prisma.designRequest.count({
      where: { baseDesignFileId: { in: files.map((f) => f.id) } },
    });
    if (referenced > 0) {
      return actionError(
        tr("production.designFileActions.referencedByRevisionRequest"),
      );
    }
    const deleted = await prisma.$transaction(async (tx) => {
      const res = await tx.designVersion.findFirst({
        where: { id: v.id, status: { in: ["DRAFT", "REJECTED"] } },
        select: { id: true },
      });
      if (!res) return false;
      await tx.designFile.deleteMany({ where: { designVersionId: v.id } });
      await tx.file.deleteMany({
        where: { id: { in: files.map((f) => f.file.id) } },
      });
      await tx.designVersion.delete({ where: { id: v.id } });
      return true;
    });
    if (!deleted) {
      return actionError(tr("production.designFileActions.lockedConfirmed"));
    }
    for (const f of files) await deleteObject(f.file.storageKey);
    await recordAudit({
      action: "DELETE",
      tableName: "design_versions",
      recordId: v.id,
      before: {
        note: tr("production.designFileActions.versionDeletedAudit", {
          version: v.version,
        }),
        itemId: v.itemId,
        customerBpId: v.customerBpId,
      },
    });
    revalidate(v);
    return actionOk({ itemId: v.itemId });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotDelete"), tr));
  }
}

// ─── 確定（承認は任意 — MS0B に段があれば通る） ──────────────────────────────

/**
 * 確定へ進める。承認設定 (MS0B) の「設計図の版」に段があれば承認依頼
 * （REQUESTED）、無ければその場で確定する。**フローを組まない限り今までどおり
 * 登録してすぐ使える** — 出荷書・工程フロー変更と同じ「未設定 = 素通し」。
 */
export async function submitDesignVersion(
  id: string,
): Promise<ActionResult<{ confirmed: boolean }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const v = await loadVersion(id);
    if (!v) return actionError(tr("production.designFileActions.notFound"));
    if (!canSubmitVersion(v.status)) {
      return actionError(
        describeVersionLock(v.status, tr) ??
          tr("production.designFileActions.cannotEdit"),
      );
    }
    const actor = await getCurrentActorId();
    const needsApproval =
      (await assertFlowConfigured("design_versions")) == null;

    if (!needsApproval) {
      const ok = await prisma.$transaction((tx) =>
        confirmVersionInTx(
          tx,
          v.id,
          actor,
          historyJson(appendHistory(v.history, entry("CONFIRM", actor))),
        ),
      );
      if (!ok) return actionError(tr("approvals.engine.alreadyProcessed"));
      await recordAudit({
        action: "UPDATE",
        tableName: "design_versions",
        recordId: v.id,
        before: { status: v.status },
        after: { status: "CONFIRMED" },
      });
      revalidate(v);
      return actionOk({ confirmed: true });
    }

    // **状態より先に依頼を作る** — 逆順だと依頼の作成が失敗したとき、版だけが
    // 承認依頼中のまま誰の承認一覧にも出ない（設計依頼と同じ順序）。
    const started = await startApprovalFlow({
      targetType: "design_versions",
      targetId: v.id,
    });
    if (!started.ok) {
      return actionError(
        started.error ??
          tr("production.designFileActions.approvalRequestFailed"),
      );
    }
    const res = await prisma.designVersion.updateMany({
      where: { id: v.id, status: { in: ["DRAFT", "REJECTED"] } },
      data: {
        status: "REQUESTED",
        requestedAt: new Date(),
        requestedBy: actor,
        history: historyJson(
          appendHistory(v.history, entry("REQUEST_APPROVAL", actor)),
        ),
      },
    });
    if (res.count !== 1) {
      await cancelApprovalFlow({
        targetType: "design_versions",
        targetId: v.id,
      });
      return actionError(tr("approvals.engine.alreadyProcessed"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: v.id,
      before: { status: v.status },
      after: { status: "REQUESTED" },
    });
    revalidate(v);
    return actionOk({ confirmed: false });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.designFileActions.approvalRequestFailed"),
        tr,
      ),
    );
  }
}

/** 承認 — 現在の段に承認を記録し、全段通過で確定する。 */
export async function approveDesignVersion(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  // 承認グループ所属（本人 or 代理）は actOnCurrentStep 内で検証する。
  const authz = await checkApprovalDocAccess("design_file");
  if (!authz.ok) return actionError(authz.error);
  try {
    const v = await loadVersion(id);
    if (!v) return actionError(tr("production.designFileActions.notFound"));
    if (v.status !== "REQUESTED") {
      return actionError(tr("production.designFileActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "design_versions",
      targetId: v.id,
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotApprove"));
    }
    const actor = await getCurrentActorId();
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "design_versions",
        recordId: v.id,
        after: {
          note: acted.stepClosed
            ? tr("production.designFileActions.approvedToNextStep")
            : tr("production.designFileActions.approvedRemaining", {
                remaining: acted.remaining,
              }),
        },
      });
      revalidate(v);
      return actionOk();
    }
    const ok = await prisma.$transaction((tx) =>
      confirmVersionInTx(
        tx,
        v.id,
        actor,
        historyJson(appendHistory(v.history, entry("APPROVE", actor))),
      ),
    );
    if (!ok) return actionError(tr("approvals.engine.alreadyProcessed"));
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: v.id,
      before: { status: "REQUESTED" },
      after: { status: "CONFIRMED" },
    });
    revalidate(v);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — REQUESTED → REJECTED（理由必須）。差し戻した版はまた直せる。 */
export async function rejectDesignVersion(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("design_file");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  try {
    const v = await loadVersion(id);
    if (!v) return actionError(tr("production.designFileActions.notFound"));
    if (v.status !== "REQUESTED") {
      return actionError(tr("production.designFileActions.notPendingApproval"));
    }
    const acted = await actOnCurrentStep({
      targetType: "design_versions",
      targetId: v.id,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.couldNotSendItBack"));
    }
    const actor = await getCurrentActorId();
    await prisma.designVersion.update({
      where: { id: v.id },
      data: {
        status: "REJECTED",
        history: historyJson(
          appendHistory(v.history, entry("REJECT", actor, trimmed)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: v.id,
      before: { status: "REQUESTED" },
      after: { status: "REJECTED", rejectReason: trimmed },
    });
    revalidate(v);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}
