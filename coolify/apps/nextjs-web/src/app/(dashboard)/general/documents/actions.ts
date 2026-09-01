"use server";

/**
 * Server Actions — 社内文書 (CM03, app.internal_pages)。
 *
 * 保存のたびに不変のリビジョンを積み、同じトランザクションで
 *   ① 変更量（+N/-M）を数え
 *   ② 行コメントの current_line を写し替え
 *   ③ 行 blame を更新する
 * まで済ませる。あとから数え直すには全版の本文を読む必要があるので、
 * 書いた瞬間に確定させておく。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  actOnCurrentStep,
  assertFlowConfigured,
  startApprovalFlow,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import {
  checkApprovalDocAccess,
  checkPermission,
  sessionUserId,
} from "@/lib/authz";
import { prisma } from "@/lib/db";
import { PAGE_OWNER_TYPE } from "@/lib/internal-pages";
import {
  diffStats,
  lineCountOf,
  MAX_DOC_LINES,
  normalizeBody,
  remapLineAnchors,
} from "@/lib/line-anchor";
import { mintShortLinks } from "@/lib/link-index";
import { collectMarkdownLinks } from "@/lib/markdown-links";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { replaceShareGrants, shareAccessFor } from "@/lib/share-grants";

const BASE_PATH = "/general/documents";
const TASKS_PATH = "/general/tasks";

function revalidate(pageNumber?: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(TASKS_PATH);
  if (pageNumber) {
    for (const suffix of ["", "/edit", "/review", "/revisions"]) {
      revalidatePath(`${BASE_PATH}/${pageNumber}${suffix}`);
    }
  }
}

function pageInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, tr("general.documentActions.titleRequired"))
      .max(200),
    summary: z.string().max(1000),
    folder: z.string().max(200),
    approvalRequired: z.boolean(),
  });
}

function bodyInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, tr("general.documentActions.titleRequired"))
      .max(200),
    body: z.string(),
    note: z.string().max(500),
  });
}

export type PageInput = z.infer<ReturnType<typeof pageInputSchema>>;
export type PageBodyInput = z.infer<ReturnType<typeof bodyInputSchema>>;

const shareGrantInput = z.object({
  subjectType: z.enum(["EVERYONE", "PLANT", "ROLE", "USER"]),
  subjectId: z.string().nullable(),
  level: z.enum(["RESPOND", "READ", "EDIT", "MANAGE"]),
});

async function requirePageEdit(
  pageNumber: string,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<
  | { ok: true; page: { id: string; createdBy: string | null } }
  | { ok: false; error: string }
> {
  const authz = await checkPermission("internal_page", "UPDATE");
  if (!authz.ok) return { ok: false, error: authz.error };
  const page = await prisma.internalPage.findUnique({
    where: { pageNumber },
    select: { id: true, createdBy: true },
  });
  if (!page)
    return { ok: false, error: tr("general.documentActions.pageNotFound") };
  const access = await shareAccessFor(
    PAGE_OWNER_TYPE,
    pageNumber,
    page.createdBy,
  );
  if (!access.canEdit)
    return {
      ok: false,
      error: tr("general.documentActions.editPermissionDenied"),
    };
  return { ok: true, page };
}

export async function createPage(
  input: PageInput,
): Promise<ActionResult<{ pageNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("internal_page", "CREATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = pageInputSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );

  try {
    const actor = await getCurrentActorId();
    const pageNumber = await nextDocumentNumber("INTERNAL_PAGE");
    await prisma.$transaction(async (tx) => {
      const page = await tx.internalPage.create({
        data: {
          pageNumber,
          title: parsed.data.title,
          summary: parsed.data.summary || null,
          folder: parsed.data.folder || null,
          approvalRequired: parsed.data.approvalRequired,
          createdBy: actor,
          updatedBy: actor,
        },
      });
      // 空でもリビジョン 1 を作る — 「作成」も履歴に残す。
      await tx.internalPageRevision.create({
        data: {
          pageId: page.id,
          revision: 1,
          title: parsed.data.title,
          body: "",
          action: "CREATE",
          editedBy: actor,
        },
      });
    });
    await recordAudit({
      action: "CREATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: { title: parsed.data.title },
    });
    revalidate(pageNumber);
    return actionOk({ pageNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.documentActions.createFailed"), tr),
    );
  }
}

export async function updatePageSettings(
  pageNumber: string,
  input: PageInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requirePageEdit(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  const parsed = pageInputSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );

  try {
    await prisma.internalPage.update({
      where: { pageNumber },
      data: {
        title: parsed.data.title,
        summary: parsed.data.summary || null,
        folder: parsed.data.folder || null,
        approvalRequired: parsed.data.approvalRequired,
        updatedBy: await getCurrentActorId(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: { title: parsed.data.title },
    });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/**
 * 本文を保存する（= 新しいリビジョンを積む）。
 *
 * 「復元」もこの経路（過去の本文を渡す）— 履歴を巻き戻さず、前に進めることで
 * 元に戻す。証跡が消えないのが利点。
 */
export async function savePageBody(
  pageNumber: string,
  input: PageBodyInput,
  action: "UPDATE" | "RESTORE" = "UPDATE",
): Promise<ActionResult<{ revision: number }>> {
  const tr = await getTranslations();
  const gate = await requirePageEdit(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  const parsed = bodyInputSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );

  const body = normalizeBody(parsed.data.body);
  if (lineCountOf(body) > MAX_DOC_LINES) {
    return actionError(
      tr("general.documentActions.bodyTooLong", { maxLines: MAX_DOC_LINES }),
    );
  }

  try {
    const actor = await getCurrentActorId();
    const pageId = gate.page.id;

    const revision = await prisma.$transaction(async (tx) => {
      const latest = await tx.internalPageRevision.findFirst({
        where: { pageId },
        orderBy: { revision: "desc" },
        select: { revision: true, body: true },
      });
      const previousBody = latest?.body ?? "";
      const next = (latest?.revision ?? 0) + 1;
      const stats = diffStats(previousBody, body);

      await tx.internalPageRevision.create({
        data: {
          pageId,
          revision: next,
          title: parsed.data.title,
          body,
          note: parsed.data.note || null,
          action,
          addedLines: stats.added,
          removedLines: stats.removed,
          editedBy: actor,
        },
      });

      // ① 行コメントの追従。消えた行は null にして outdated 扱いで残す
      //    （anchor_text があるので何への指摘かは読める）。
      const comments = await tx.internalPageLineComment.findMany({
        where: { pageId, status: "OPEN" },
        select: { id: true, currentLine: true, anchorLine: true },
      });
      if (comments.length > 0) {
        const from = comments.map((c) => c.currentLine ?? c.anchorLine);
        const to = remapLineAnchors(previousBody, body, from);
        await Promise.all(
          comments.map((c, i) =>
            tx.internalPageLineComment.update({
              where: { id: c.id },
              data: { currentLine: to[i] },
            }),
          ),
        );
      }

      // ② 行 blame。変わっていない行は番号だけ付け替え、変わった行は今回の版に。
      const oldBlame = await tx.internalPageLineBlame.findMany({
        where: { pageId },
        select: { line: true, revision: true, editedBy: true, editedAt: true },
      });
      const movedLines = remapLineAnchors(
        previousBody,
        body,
        oldBlame.map((b) => b.line),
      );
      const carried = new Map<
        number,
        { revision: number; editedBy: string | null; editedAt: Date }
      >();
      oldBlame.forEach((b, i) => {
        const line = movedLines[i];
        if (line != null) {
          carried.set(line, {
            revision: b.revision,
            editedBy: b.editedBy,
            editedAt: b.editedAt,
          });
        }
      });
      const now = new Date();
      for (const line of stats.changedLines) {
        carried.set(line, { revision: next, editedBy: actor, editedAt: now });
      }
      // 行が 1 本も無い（空文書）ときも整合させるため、常に全消し → 全入れ。
      await tx.internalPageLineBlame.deleteMany({ where: { pageId } });
      const rows = [...carried.entries()]
        .filter(([line]) => line >= 1 && line <= lineCountOf(body))
        .map(([line, v]) => ({ pageId, line, ...v }));
      if (rows.length > 0) {
        await tx.internalPageLineBlame.createMany({ data: rows });
      }

      await tx.internalPage.update({
        where: { id: pageId },
        data: {
          title: parsed.data.title,
          updatedBy: actor,
          // 公開版より新しい編集が入ったので下書きへ戻す（公開版はそのまま残る）。
          status: "DRAFT",
        },
      });
      return next;
    });

    // 本文中の外部 URL を link_index に登録しておく（本文自体は書き換えない —
    // ソースを短縮 URL に置換すると、書いた覚えのない差分が出る）。描画時は
    // lookupShortLinkCodes で引いて /l/<code> に差し替える。
    // 失敗しても本文の保存は成立させる（リンクがそのまま出ないだけ）。
    try {
      await mintShortLinks(collectMarkdownLinks(body));
    } catch (e) {
      console.error("mintShortLinks failed for", pageNumber, e);
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: {
        note:
          action === "RESTORE"
            ? tr("general.documentActions.restoredAsRevisionNote", { revision })
            : tr("general.documentActions.savedRevisionNote", { revision }),
      },
    });
    revalidate(pageNumber);
    return actionOk({ revision });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** 過去のリビジョンの内容で新しいリビジョンを作る。 */
export async function restoreRevision(
  pageNumber: string,
  revision: number,
): Promise<ActionResult<{ revision: number }>> {
  const tr = await getTranslations();
  const gate = await requirePageEdit(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  const source = await prisma.internalPageRevision.findUnique({
    where: { pageId_revision: { pageId: gate.page.id, revision } },
    select: { title: true, body: true },
  });
  if (!source)
    return actionError(tr("general.documentActions.revisionNotFound"));

  return savePageBody(
    pageNumber,
    {
      title: source.title,
      body: source.body,
      note: tr("general.documentActions.restoredFromRevisionNote", {
        revision,
      }),
    },
    "RESTORE",
  );
}

/**
 * 公開する。承認が要る文書は承認フローを起こし、要らない文書は即座に公開版を進める。
 * **未解決コメントがあっても止めない** — 画面側で件数を警告するだけ。
 */
export async function publishPage(pageNumber: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requirePageEdit(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  const page = await prisma.internalPage.findUnique({
    where: { pageNumber },
    select: { id: true, approvalRequired: true, status: true },
  });
  if (!page) return actionError(tr("general.documentActions.pageNotFound"));
  if (page.status === "PENDING")
    return actionError(tr("general.documentActions.alreadyPendingPublish"));

  const latest = await prisma.internalPageRevision.findFirst({
    where: { pageId: page.id },
    orderBy: { revision: "desc" },
    select: { revision: true, body: true },
  });
  if (!latest || latest.body.trim() === "")
    return actionError(tr("general.documentActions.bodyIsEmpty"));

  try {
    if (page.approvalRequired) {
      const missing = await assertFlowConfigured("internal_pages");
      if (missing) return actionError(missing);
      const started = await startApprovalFlow({
        targetType: "internal_pages",
        targetId: pageNumber,
      });
      if (!started.ok)
        return actionError(
          started.error ??
            tr("production.workOrderActions.requestApprovalFailed"),
        );
      await prisma.internalPage.update({
        where: { id: page.id },
        data: { status: "PENDING", updatedBy: await getCurrentActorId() },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "internal_pages",
        recordId: pageNumber,
        after: {
          note: tr("general.documentActions.publishRequestedNote", {
            revision: latest.revision,
          }),
        },
      });
    } else {
      await prisma.internalPage.update({
        where: { id: page.id },
        data: {
          status: "PUBLISHED",
          publishedRevision: latest.revision,
          updatedBy: await getCurrentActorId(),
        },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "internal_pages",
        recordId: pageNumber,
        after: {
          note: tr("general.documentActions.publishedNote", {
            revision: latest.revision,
          }),
        },
      });
    }
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.documentActions.publishFailed"), tr),
    );
  }
}

async function actOnPage(
  pageNumber: string,
  action: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("internal_page");
  if (!authz.ok) return actionError(authz.error);

  const page = await prisma.internalPage.findUnique({
    where: { pageNumber },
    select: { id: true, status: true },
  });
  if (!page) return actionError(tr("general.documentActions.pageNotFound"));
  if (page.status !== "PENDING")
    return actionError(tr("general.documentActions.pageNotPendingApproval"));

  const result = await actOnCurrentStep({
    targetType: "internal_pages",
    targetId: pageNumber,
    action,
    comment,
  });
  if (!result.ok)
    return actionError(result.error ?? tr("common.theOperationFailed"));

  try {
    if (action === "REJECTED") {
      await prisma.internalPage.update({
        where: { id: page.id },
        data: { status: "DRAFT" },
      });
    } else if (result.flowCompleted) {
      const latest = await prisma.internalPageRevision.findFirst({
        where: { pageId: page.id },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      await prisma.internalPage.update({
        where: { id: page.id },
        data: {
          status: "PUBLISHED",
          publishedRevision: latest?.revision ?? null,
        },
      });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: {
        note:
          action === "APPROVED"
            ? result.flowCompleted
              ? tr("general.documentActions.publishApprovedFinalNote")
              : tr("general.documentActions.publishApprovedNextStepNote")
            : tr("general.documentActions.publishRejectedNote", {
                reason: comment ?? "",
              }),
      },
    });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.theOperationFailed"), tr),
    );
  }
}

export async function approvePagePublish(
  pageNumber: string,
  comment?: string,
): Promise<ActionResult> {
  return actOnPage(pageNumber, "APPROVED", comment);
}

export async function rejectPagePublish(
  pageNumber: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const trimmed = reason.trim();
  if (!trimmed)
    return actionError(tr("general.documentActions.rejectReasonRequired"));
  return actOnPage(pageNumber, "REJECTED", trimmed);
}

export async function savePageShareGrants(
  pageNumber: string,
  grants: z.infer<typeof shareGrantInput>[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("internal_page", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const page = await prisma.internalPage.findUnique({
    where: { pageNumber },
    select: { createdBy: true },
  });
  if (!page) return actionError(tr("general.documentActions.pageNotFound"));
  const access = await shareAccessFor(
    PAGE_OWNER_TYPE,
    pageNumber,
    page.createdBy,
  );
  if (!access.canManage)
    return actionError(tr("general.documentActions.managePermissionDenied"));

  const parsed = z.array(shareGrantInput).max(200).safeParse(grants);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("general.documentActions.invalidShareSettings"),
    );

  try {
    await replaceShareGrants(
      PAGE_OWNER_TYPE,
      pageNumber,
      parsed.data,
      await getCurrentActorId(),
    );
    await recordAudit({
      action: "UPDATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: {
        note: tr("general.documentActions.shareSettingsUpdatedNote", {
          count: parsed.data.length,
        }),
      },
    });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("general.documentActions.saveShareSettingsFailed"),
        tr,
      ),
    );
  }
}

// ── 行コメント ───────────────────────────────────────────────────────────────

async function requirePageRead(
  pageNumber: string,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<
  | { ok: true; page: { id: string; createdBy: string | null }; userId: string }
  | { ok: false; error: string }
> {
  const authz = await checkPermission("internal_page", "READ");
  if (!authz.ok) return { ok: false, error: authz.error };
  const userId = await sessionUserId();
  if (!userId)
    return { ok: false, error: tr("general.documentActions.loginRequired") };
  const page = await prisma.internalPage.findUnique({
    where: { pageNumber },
    select: { id: true, createdBy: true },
  });
  if (!page)
    return { ok: false, error: tr("general.documentActions.pageNotFound") };
  const access = await shareAccessFor(
    PAGE_OWNER_TYPE,
    pageNumber,
    page.createdBy,
  );
  if (!access.canRead)
    return {
      ok: false,
      error: tr("general.documentActions.readPermissionDenied"),
    };
  return { ok: true, page, userId };
}

export async function addLineComment(
  pageNumber: string,
  input: { line: number; body: string; threadId?: string },
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requirePageRead(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  const body = input.body.trim();
  if (!body) return actionError(tr("general.documentActions.commentRequired"));
  if (body.length > 5000)
    return actionError(tr("general.documentActions.commentTooLong"));

  try {
    const latest = await prisma.internalPageRevision.findFirst({
      where: { pageId: gate.page.id },
      orderBy: { revision: "desc" },
      select: { revision: true, body: true },
    });
    if (!latest) return actionError(tr("general.documentActions.noBodyYet"));

    const lines = normalizeBody(latest.body).split("\n");
    const anchorText = lines[input.line - 1] ?? "";

    const created = await prisma.internalPageLineComment.create({
      data: {
        pageId: gate.page.id,
        // スレッドの根は自分自身。返信は根の id を渡してもらう。
        threadId: input.threadId ?? "00000000-0000-0000-0000-000000000000",
        revision: latest.revision,
        anchorLine: input.line,
        anchorText,
        currentLine: input.line,
        body,
        createdBy: gate.userId,
      },
    });
    if (!input.threadId) {
      await prisma.internalPageLineComment.update({
        where: { id: created.id },
        data: { threadId: created.id },
      });
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "internal_pages",
      recordId: pageNumber,
      after: {
        note: tr("general.documentActions.commentAddedNote", {
          line: input.line,
        }),
      },
    });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("general.documentActions.saveCommentFailed"),
        tr,
      ),
    );
  }
}

export async function setCommentResolved(
  pageNumber: string,
  threadId: string,
  resolved: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requirePageRead(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  try {
    await prisma.internalPageLineComment.updateMany({
      where: { pageId: gate.page.id, threadId },
      data: {
        status: resolved ? "RESOLVED" : "OPEN",
        resolvedBy: resolved ? gate.userId : null,
        resolvedAt: resolved ? new Date() : null,
      },
    });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.documentActions.updateFailed"), tr),
    );
  }
}

export async function deleteLineComment(
  pageNumber: string,
  commentId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requirePageRead(pageNumber, tr);
  if (!gate.ok) return actionError(gate.error);

  try {
    const row = await prisma.internalPageLineComment.findUnique({
      where: { id: commentId },
      select: { createdBy: true, pageId: true },
    });
    if (!row || row.pageId !== gate.page.id)
      return actionError(tr("general.documentActions.commentNotFound"));
    // 消せるのは本人だけ（管理者は system:ADMIN で別途）。
    const admin = await checkPermission("internal_page", "ADMIN");
    if (row.createdBy !== gate.userId && !admin.ok)
      return actionError(tr("general.documentActions.canOnlyDeleteOwnComment"));

    await prisma.internalPageLineComment.delete({ where: { id: commentId } });
    revalidate(pageNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotDelete"), tr));
  }
}
