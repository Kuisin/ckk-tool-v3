"use server";

/**
 * Server Actions — フォーム (CM02, app.forms)。
 *
 * 2 つの権限軸が混ざるので、どちらを見ているか常に意識すること:
 *   - `form` 権限コード … フォームを作る / 直す / アーカイブする側の門番。
 *   - share_grants     … そのフォームに誰が回答・閲覧・編集できるか。
 *     既定は非公開で、共有行が無ければ作成者と system:ADMIN 以外には見えない。
 *
 * 受付期間（opens_at / closes_at）と回答の編集期限は **必ずここで再判定する**。
 * 画面のボタンを無効にしただけでは、期限後のリクエストを素通しする。
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
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import {
  checkApprovalDocAccess,
  checkPermission,
  sessionUserId,
} from "@/lib/authz";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import {
  canEditResponse,
  type FormAnswerValue,
  type FormFieldDef,
  formAvailability,
  normalizeOrder,
  parseFormFields,
  toPlainAnswers,
  validateAnswers,
} from "@/lib/form-schema";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { replaceShareGrants, shareAccessFor } from "@/lib/share-grants";

const BASE_PATH = "/general/forms";
const TASKS_PATH = "/general/tasks";
const FORM_OWNER_TYPE = "forms";

function revalidate(code?: string, responseNumber?: string) {
  revalidatePath(BASE_PATH);
  // 承認待ち・未回答フォームは 承認・予定 (CM01) にも出る。
  revalidatePath(TASKS_PATH);
  if (code) {
    revalidatePath(`${BASE_PATH}/${code}`);
    revalidatePath(`${BASE_PATH}/${code}/edit`);
    revalidatePath(`/f/${code}`);
  }
  if (code && responseNumber) {
    revalidatePath(`${BASE_PATH}/${code}/responses/${responseNumber}`);
  }
}

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

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

const dateTimeOrNull = z
  .string()
  .nullable()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "日時が不正です");

const formSettingsInput = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください").max(200),
  description: z.string().max(2000),
  kind: z.enum(["SURVEY", "REQUEST"]),
  respondentVisibility: z.enum(["SHOWN", "HIDDEN"]),
  approvalEnabled: z.boolean(),
  allowMultiple: z.boolean(),
  opensAt: dateTimeOrNull,
  closesAt: dateTimeOrNull,
  responseEditMode: z.enum(["NONE", "UNTIL_CLOSE", "UNTIL_DATE"]),
  responseEditableUntil: dateTimeOrNull,
});

export type FormSettingsInput = z.input<typeof formSettingsInput>;

const shareGrantInput = z.object({
  subjectType: z.enum(["EVERYONE", "PLANT", "ROLE", "USER"]),
  subjectId: z.string().nullable(),
  level: z.enum(["RESPOND", "READ", "EDIT", "MANAGE"]),
});

export type ShareGrantInputDto = z.infer<typeof shareGrantInput>;

/** 期間の前後関係など、単体では見られない整合を確かめる。 */
function checkWindows(v: z.infer<typeof formSettingsInput>): string | null {
  if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) {
    return "受付終了は受付開始より後にしてください";
  }
  if (v.responseEditMode === "UNTIL_DATE" && !v.responseEditableUntil) {
    return "編集期限の日時を指定してください";
  }
  if (
    v.responseEditMode === "UNTIL_DATE" &&
    v.opensAt &&
    v.responseEditableUntil &&
    v.responseEditableUntil <= v.opensAt
  ) {
    return "編集期限は受付開始より後にしてください";
  }
  if (v.kind === "SURVEY" && v.approvalEnabled) {
    return "承認フローは申請・報告フォームでのみ使えます";
  }
  return null;
}

async function uniqueFormCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = generateCode(8);
    const hit = await prisma.form.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!hit) return code;
  }
  throw new Error("フォームコードを採番できませんでした");
}

// ── 定義（作る側） ───────────────────────────────────────────────────────────

export async function createForm(
  input: FormSettingsInput,
): Promise<ActionResult<{ code: string }>> {
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = formSettingsInput.safeParse(input);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  const invalid = checkWindows(parsed.data);
  if (invalid) return actionError(invalid);

  try {
    const actor = await getCurrentActorId();
    const code = await uniqueFormCode();
    await prisma.form.create({
      data: {
        code,
        title: parsed.data.title,
        description: parsed.data.description || null,
        kind: parsed.data.kind,
        respondentVisibility: parsed.data.respondentVisibility,
        approvalEnabled: parsed.data.approvalEnabled,
        allowMultiple: parsed.data.allowMultiple,
        opensAt: parsed.data.opensAt,
        closesAt: parsed.data.closesAt,
        responseEditMode: parsed.data.responseEditMode,
        responseEditableUntil: parsed.data.responseEditableUntil,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "forms",
      recordId: code,
      after: { title: parsed.data.title, kind: parsed.data.kind },
    });
    revalidate(code);
    return actionOk({ code });
  } catch (e) {
    return prismaErrorMessage
      ? actionError(prismaErrorMessage(e, "作成に失敗しました"))
      : actionError("作成に失敗しました");
  }
}

/** 編集できるのは form:UPDATE を持つ人のうち、そのフォームの EDIT 以上。 */
async function requireFormEdit(
  code: string,
): Promise<
  | { ok: true; form: { id: string; code: string; createdBy: string | null } }
  | { ok: false; error: string }
> {
  const authz = await checkPermission("form", "UPDATE");
  if (!authz.ok) return { ok: false, error: authz.error };
  const form = await prisma.form.findUnique({
    where: { code },
    select: { id: true, code: true, createdBy: true },
  });
  if (!form) return { ok: false, error: "フォームが見つかりません" };
  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canEdit)
    return { ok: false, error: "このフォームを編集する権限がありません" };
  return { ok: true, form };
}

export async function updateFormSettings(
  code: string,
  input: FormSettingsInput,
): Promise<ActionResult> {
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = formSettingsInput.safeParse(input);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  const invalid = checkWindows(parsed.data);
  if (invalid) return actionError(invalid);

  try {
    const before = await prisma.form.findUnique({
      where: { code },
      select: { title: true, closesAt: true, opensAt: true },
    });
    await prisma.form.update({
      where: { code },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        kind: parsed.data.kind,
        respondentVisibility: parsed.data.respondentVisibility,
        approvalEnabled: parsed.data.approvalEnabled,
        allowMultiple: parsed.data.allowMultiple,
        opensAt: parsed.data.opensAt,
        closesAt: parsed.data.closesAt,
        responseEditMode: parsed.data.responseEditMode,
        responseEditableUntil: parsed.data.responseEditableUntil,
        updatedBy: await getCurrentActorId(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      before: before ?? undefined,
      after: {
        title: parsed.data.title,
        opensAt: parsed.data.opensAt,
        closesAt: parsed.data.closesAt,
      },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保存に失敗しました"));
  }
}

/**
 * 項目定義を新しいバージョンとして保存し、公開する。
 *
 * 既存バージョンは書き換えない — 過去の回答が「回答した時点の定義」を指し続ける
 * ようにするため。項目を消しても、その項目に答えた回答は元の版で読める。
 */
export async function publishFormFields(
  code: string,
  fields: unknown,
): Promise<ActionResult<{ version: number }>> {
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = parseFormFields(fields);
  if (!parsed.ok) return actionError(parsed.error);
  if (parsed.fields.length === 0)
    return actionError("項目を 1 つ以上追加してください");

  const ordered = normalizeOrder(parsed.fields);
  try {
    const actor = await getCurrentActorId();
    const version = await prisma.$transaction(async (tx) => {
      const form = await tx.form.findUniqueOrThrow({
        where: { code },
        select: { id: true, currentVersion: true },
      });
      const next = form.currentVersion + 1;
      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: next,
          schema: ordered as unknown as object,
          publishedBy: actor,
        },
      });
      await tx.form.update({
        where: { id: form.id },
        data: { currentVersion: next, status: "PUBLISHED", updatedBy: actor },
      });
      return next;
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: `項目定義をバージョン ${version} として公開` },
    });
    revalidate(code);
    return actionOk({ version });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "公開に失敗しました"));
  }
}

export async function setFormArchived(
  code: string,
  archived: boolean,
): Promise<ActionResult> {
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);
  try {
    await prisma.form.update({
      where: { code },
      data: {
        status: archived ? "ARCHIVED" : "PUBLISHED",
        updatedBy: await getCurrentActorId(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: archived ? "アーカイブ" : "アーカイブを解除" },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "更新に失敗しました"));
  }
}

/** 共有設定はまとめて置き換える（消し忘れによる権限の残留を防ぐ）。 */
export async function saveShareGrants(
  code: string,
  grants: ShareGrantInputDto[],
): Promise<ActionResult> {
  const authz = await checkPermission("form", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const form = await prisma.form.findUnique({
    where: { code },
    select: { createdBy: true },
  });
  if (!form) return actionError("フォームが見つかりません");
  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canManage)
    return actionError("このフォームの共有を変更する権限がありません");

  const parsed = z.array(shareGrantInput).max(200).safeParse(grants);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "共有設定が不正です");

  try {
    await replaceShareGrants(
      FORM_OWNER_TYPE,
      code,
      parsed.data,
      await getCurrentActorId(),
    );
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: `共有設定を更新（${parsed.data.length} 件）` },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "共有設定の保存に失敗しました"));
  }
}

// ── 回答（答える側） ─────────────────────────────────────────────────────────

interface RespondContext {
  userId: string;
  form: {
    id: string;
    code: string;
    kind: "SURVEY" | "REQUEST";
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    opensAt: Date | null;
    closesAt: Date | null;
    currentVersion: number;
    approvalEnabled: boolean;
    allowMultiple: boolean;
    createdBy: string | null;
    responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
    responseEditableUntil: Date | null;
  };
  fields: FormFieldDef[];
}

async function loadRespondContext(
  code: string,
): Promise<{ ok: true; ctx: RespondContext } | { ok: false; error: string }> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "ログインしてください" };

  const form = await prisma.form.findUnique({
    where: { code },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!form) return { ok: false, error: "フォームが見つかりません" };

  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canRespond)
    return { ok: false, error: "このフォームに回答する権限がありません" };

  const parsed = parseFormFields(form.versions[0]?.schema ?? []);
  if (!parsed.ok || parsed.fields.length === 0)
    return { ok: false, error: "このフォームはまだ公開されていません" };

  return {
    ok: true,
    ctx: { userId, form, fields: parsed.fields },
  };
}

/**
 * 回答を提出する（下書き保存も同じ経路）。
 * 受付期間はここで必ず見る — クライアントの無効化は UI だけの話。
 */
export async function submitResponse(
  code: string,
  answers: Record<string, FormAnswerValue>,
  asDraft = false,
): Promise<ActionResult<{ responseNumber: string }>> {
  const loaded = await loadRespondContext(code);
  if (!loaded.ok) return actionError(loaded.error);
  const { userId, form, fields } = loaded.ctx;

  const availability = formAvailability(form, new Date());
  if (availability !== "OPEN") {
    return actionError(
      availability === "SCHEDULED"
        ? "このフォームはまだ受付前です"
        : "このフォームの受付は終了しています",
    );
  }

  if (!asDraft) {
    const errors = validateAnswers(fields, answers);
    const first = Object.values(errors)[0];
    if (first) return actionError(first);
  }

  if (!form.allowMultiple && !asDraft) {
    const existing = await prisma.formResponse.findFirst({
      where: { formId: form.id, submittedBy: userId, status: { not: "DRAFT" } },
      select: { responseNumber: true },
    });
    if (existing) return actionError("このフォームには既に回答済みです");
  }

  try {
    const responseNumber = await nextDocumentNumber("FORM_RESPONSE");
    const plainText = toPlainAnswers(fields, answers);

    const created = await prisma.$transaction(async (tx) => {
      // フォーム内の連番。UPDATE ... RETURNING 相当で行ロックを取るので競合しない。
      const bumped = await tx.form.update({
        where: { id: form.id },
        data: { recordSeq: { increment: 1 } },
        select: { recordSeq: true },
      });
      return tx.formResponse.create({
        data: {
          responseNumber,
          recordNo: bumped.recordSeq,
          formId: form.id,
          version: form.currentVersion,
          status: asDraft ? "DRAFT" : "SUBMITTED",
          answers: answers as unknown as object,
          plainText,
          submittedBy: userId,
          submittedAt: asDraft ? null : new Date(),
          history: [
            entry(asDraft ? "DRAFT" : "SUBMIT", userId),
          ] as unknown as object,
        },
        select: { responseNumber: true },
      });
    });

    await recordAudit({
      action: "CREATE",
      tableName: "form_responses",
      recordId: created.responseNumber,
      after: { note: asDraft ? "下書き保存" : "回答を提出" },
    });
    revalidate(code, created.responseNumber);
    return actionOk({ responseNumber: created.responseNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "回答の保存に失敗しました"));
  }
}

/** 自分の回答を編集する（編集期限の判定はここが最終防衛線）。 */
export async function updateResponse(
  responseNumber: string,
  answers: Record<string, FormAnswerValue>,
): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return actionError("ログインしてください");

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError("回答が見つかりません");

  if (!canEditResponse(row.form, row, userId, new Date())) {
    return actionError("この回答は編集できません（期限切れ、または本人以外）");
  }

  const fieldsParsed = parseFormFields(
    (
      await prisma.formVersion.findUnique({
        where: { formId_version: { formId: row.formId, version: row.version } },
        select: { schema: true },
      })
    )?.schema ?? [],
  );
  if (!fieldsParsed.ok) return actionError("フォームの定義を読み込めません");

  const errors = validateAnswers(fieldsParsed.fields, answers);
  const first = Object.values(errors)[0];
  if (first) return actionError(first);

  try {
    await prisma.formResponse.update({
      where: { responseNumber },
      data: {
        answers: answers as unknown as object,
        plainText: toPlainAnswers(fieldsParsed.fields, answers),
        history: appendHistory(
          row.history,
          entry("UPDATE", userId),
        ) as unknown as object,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: { note: "回答を編集" },
    });
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "回答の更新に失敗しました"));
  }
}

// ── 承認（申請・報告フォーム） ───────────────────────────────────────────────

export async function requestResponseApproval(
  responseNumber: string,
): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return actionError("ログインしてください");

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError("回答が見つかりません");
  if (!row.form.approvalEnabled)
    return actionError("このフォームは承認フローを使いません");
  if (row.submittedBy !== userId)
    return actionError("承認依頼は回答した本人だけが出せます");
  if (row.status !== "SUBMITTED" && row.status !== "REJECTED")
    return actionError("この状態からは承認依頼を出せません");

  const missing = await assertFlowConfigured("form_responses");
  if (missing) return actionError(missing);

  const started = await startApprovalFlow({
    targetType: "form_responses",
    targetId: responseNumber,
  });
  if (!started.ok)
    return actionError(started.error ?? "承認依頼に失敗しました");

  try {
    await prisma.formResponse.update({
      where: { responseNumber },
      data: {
        status: "REQUESTED",
        history: appendHistory(
          row.history,
          entry("REQUEST", userId),
        ) as unknown as object,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      before: { status: row.status },
      after: { status: "REQUESTED" },
    });
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

async function actOnResponse(
  responseNumber: string,
  action: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  // 承認できるかは「その書類を読める/直せる」+ 承認グループ所属の 2 段。
  const authz = await checkApprovalDocAccess("form");
  if (!authz.ok) return actionError(authz.error);

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError("回答が見つかりません");
  if (row.status !== "REQUESTED")
    return actionError("この回答は承認待ちではありません");

  const result = await actOnCurrentStep({
    targetType: "form_responses",
    targetId: responseNumber,
    action,
    comment,
  });
  if (!result.ok) return actionError(result.error ?? "処理に失敗しました");

  try {
    const actor = await getCurrentActorId();
    // 全段が終わったときだけ回答の状態を進める。
    const done = action === "REJECTED" || result.flowCompleted;
    if (done) {
      await prisma.formResponse.update({
        where: { responseNumber },
        data: {
          status: action === "APPROVED" ? "APPROVED" : "REJECTED",
          approvedAt: action === "APPROVED" ? new Date() : null,
          rejectedAt: action === "REJECTED" ? new Date() : null,
          rejectReason: action === "REJECTED" ? (comment ?? null) : null,
          history: appendHistory(
            row.history,
            entry(action, actor, comment),
          ) as unknown as object,
        },
      });
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      before: { status: row.status },
      after: {
        note:
          action === "APPROVED"
            ? done
              ? "承認（全段完了）"
              : "承認（次の段へ）"
            : `差し戻し: ${comment ?? ""}`,
      },
    });
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "処理に失敗しました"));
  }
}

export async function approveResponse(
  responseNumber: string,
  comment?: string,
): Promise<ActionResult> {
  return actOnResponse(responseNumber, "APPROVED", comment);
}

export async function rejectResponse(
  responseNumber: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻しの理由を入力してください");
  return actOnResponse(responseNumber, "REJECTED", trimmed);
}
