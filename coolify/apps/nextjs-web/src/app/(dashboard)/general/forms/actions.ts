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
  assertFormFlowConfigured,
  type HistoryEntry,
  hasAnyApproval,
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
import {
  type FormExportBody,
  parseFormExport,
  remapSelfReferences,
} from "@/lib/form-transfer";
import { fetchForm } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  replaceShareGrants,
  shareAccessFor,
  visibleOwnerIds,
} from "@/lib/share-grants";
import { isShareConditionFieldType } from "@/lib/share-grants-core";

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
  editableUntilFirstApproval: z.boolean().default(false),
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
  // 「この条件に当てはまる回答だけ見せる」。READ 以外では replaceShareGrants が捨てる。
  conditionFieldKey: z.string().nullable().optional(),
  conditionValues: z.array(z.string().max(200)).max(50).optional(),
  conditionLabels: z.array(z.string().max(200)).max(50).optional(),
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
        editableUntilFirstApproval:
          parsed.data.approvalEnabled && parsed.data.editableUntilFirstApproval,
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
        editableUntilFirstApproval:
          parsed.data.approvalEnabled && parsed.data.editableUntilFirstApproval,
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

/**
 * 公開状態の切り替え。**受付可否そのものは日時から導出する**（formAvailability）
 * ので、ここで決めるのは「土台として公開されているか」だけ。
 *
 * - `PUBLISHED` … 受付開始。項目が 1 版も無いフォームは公開できない
 *   （公開 URL を開いても空のフォームしか出ないため）。
 * - `DRAFT`     … 受付を止めて手元に戻す。既存の回答は消えず、読める。
 * - `ARCHIVED`  … 使い終わったフォームを一覧の既定から外す。
 */
export async function setFormStatus(
  code: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
): Promise<ActionResult> {
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);
  try {
    const current = await prisma.form.findUniqueOrThrow({
      where: { code },
      select: { status: true, currentVersion: true },
    });
    if (current.status === status) return actionOk();
    if (status === "PUBLISHED" && current.currentVersion === 0)
      return actionError(
        "項目がまだ公開されていません。「編集」から項目を追加して保存してください",
      );

    await prisma.form.update({
      where: { code },
      data: { status, updatedBy: await getCurrentActorId() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: FORM_STATUS_NOTE[status] },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "更新に失敗しました"));
  }
}

const FORM_STATUS_NOTE: Record<"DRAFT" | "PUBLISHED" | "ARCHIVED", string> = {
  DRAFT: "下書きに戻した（受付を停止）",
  PUBLISHED: "公開した（受付を開始）",
  ARCHIVED: "アーカイブした",
};

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

  // 条件の項目は実在して、条件に使ってよい型でなければならない。画面が正しく
  // 送っていても、ここで確かめ直す（送られてきた値をそのまま信じない）。
  const detail = await fetchForm(code);
  const allowed = new Set(
    (detail?.fields ?? [])
      .filter((f) => isShareConditionFieldType(f.type))
      .map((f) => f.key),
  );
  for (const g of parsed.data) {
    if (g.level !== "READ") continue;
    if (!g.conditionFieldKey || (g.conditionValues ?? []).length === 0)
      continue;
    if (!allowed.has(g.conditionFieldKey))
      return actionError(
        "条件に使えない項目が指定されています（ドロップダウン・複数選択・業務データ検索のみ）",
      );
  }

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
/**
 * 自分の回答を保存する。下書きのまま置くか、提出するかを `asDraft` で選ぶ。
 *
 * 下書きは**まだ出していないもの**なので、検証を通さずに何度でも保存できる
 * （途中まで書いて閉じられないと「下書き」の意味がない）。提出に切り替える
 * ときに初めて必須項目を見て、受付期間と 1 人 1 回の制限もそこで確かめる。
 */
export async function updateResponse(
  responseNumber: string,
  answers: Record<string, FormAnswerValue>,
  asDraft = false,
): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return actionError("ログインしてください");

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError("回答が見つかりません");

  // 承認が下りているかはサーバでしか分からない。**画面の判定を信用しない** —
  // 編集 URL を直接叩かれても、ここで同じ規則を通す。
  const firstApprovalDone =
    row.status === "REQUESTED" &&
    (await hasAnyApproval("form_responses", responseNumber, row.createdAt));
  if (!canEditResponse(row.form, row, userId, new Date(), firstApprovalDone)) {
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

  const wasDraft = row.status === "DRAFT";
  // 下書きに戻す道は用意しない（提出済みを引っ込めるのは承認の取り消しであって
  // 編集ではない）。下書きでない回答に asDraft を渡すのは呼び違い。
  if (asDraft && !wasDraft)
    return actionError("提出済みの回答は下書きに戻せません");

  if (!asDraft) {
    const errors = validateAnswers(fieldsParsed.fields, answers);
    const first = Object.values(errors)[0];
    if (first) return actionError(first);
  }

  // 下書きを提出に切り替える瞬間だけ、新規提出と同じ関門を通す。
  if (wasDraft && !asDraft) {
    const availability = formAvailability(row.form, new Date());
    if (availability !== "OPEN")
      return actionError(
        availability === "SCHEDULED"
          ? "このフォームはまだ受付前です"
          : "このフォームの受付は終了しています",
      );
    if (!row.form.allowMultiple) {
      const existing = await prisma.formResponse.findFirst({
        where: {
          formId: row.formId,
          submittedBy: userId,
          status: { not: "DRAFT" },
        },
        select: { responseNumber: true },
      });
      if (existing) return actionError("このフォームには既に回答済みです");
    }
  }

  const action = asDraft ? "DRAFT" : wasDraft ? "SUBMIT" : "UPDATE";
  try {
    await prisma.formResponse.update({
      where: { responseNumber },
      data: {
        answers: answers as unknown as object,
        plainText: toPlainAnswers(fieldsParsed.fields, answers),
        ...(wasDraft && !asDraft
          ? { status: "SUBMITTED" as const, submittedAt: new Date() }
          : {}),
        history: appendHistory(
          row.history,
          entry(action, userId),
        ) as unknown as object,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: asDraft
          ? "下書きを保存"
          : wasDraft
            ? "下書きを提出"
            : "回答を編集",
      },
    });
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "回答の更新に失敗しました"));
  }
}

// ── 承認（申請・報告フォーム） ───────────────────────────────────────────────

/**
 * 自分の下書きを捨てる。**下書きだけ**が対象 — 提出済みの回答を消す道は
 * 用意しない（記録として残すべきものなので、取り下げは承認側の話）。
 */
export async function discardDraft(
  responseNumber: string,
): Promise<ActionResult<{ code: string }>> {
  const userId = await sessionUserId();
  if (!userId) return actionError("ログインしてください");

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    select: {
      status: true,
      submittedBy: true,
      form: { select: { code: true } },
    },
  });
  if (!row) return actionError("下書きが見つかりません");
  if (row.submittedBy !== userId || row.status !== "DRAFT")
    return actionError("この下書きは削除できません");

  try {
    await prisma.formResponse.delete({ where: { responseNumber } });
    await recordAudit({
      action: "DELETE",
      tableName: "form_responses",
      recordId: responseNumber,
      before: { note: "下書きを削除" },
    });
    revalidate(row.form.code);
    return actionOk({ code: row.form.code });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "下書きの削除に失敗しました"));
  }
}

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

  const missing = await assertFormFlowConfigured(row.formId);
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

// ── 取り込み（環境をまたぐ移送） ─────────────────────────────────────────────

/** 貼り付けの上限。フォーム定義は数 KB。桁違いのものは読まずに弾く。 */
const MAX_IMPORT_BYTES = 512 * 1024;

export interface ImportPreview {
  title: string;
  kind: "SURVEY" | "REQUEST";
  fieldCount: number;
  sourceEnv: string;
  sourceCode: string;
  sourceVersion: number;
  exportedAt: string;
  exportedBy: string | null;
  warnings: string[];
  /** 書き出し元と同じコードが取り込み先で空いているか。 */
  codeAvailable: boolean;
  /** 同じコードの既存フォームがあり、自分がそれを編集できるか。 */
  existingEditable: boolean;
  existingTitle: string | null;
}

/**
 * 取り込む前の下見。**何も書き込まない** — 取り込み先で何が起きるかを
 * 先に見せてから確定させる（コードが衝突するのか、参照が外れるのか）。
 */
export async function previewFormImport(
  text: string,
): Promise<ActionResult<ImportPreview>> {
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (text.length > MAX_IMPORT_BYTES)
    return actionError("ファイルが大きすぎます");

  const parsed = parseFormExport(text);
  if (!parsed.ok) return actionError(parsed.error);

  const existing = parsed.data.meta.sourceCode
    ? await prisma.form.findUnique({
        where: { code: parsed.data.meta.sourceCode },
        select: { code: true, title: true, createdBy: true },
      })
    : null;

  let existingEditable = false;
  if (existing) {
    const access = await shareAccessFor(
      FORM_OWNER_TYPE,
      existing.code,
      existing.createdBy,
    );
    existingEditable = access.canEdit;
  }

  return actionOk({
    title: parsed.data.form.title,
    kind: parsed.data.form.kind,
    fieldCount: parsed.data.form.fields.length,
    sourceEnv: parsed.data.meta.sourceEnv,
    sourceCode: parsed.data.meta.sourceCode,
    sourceVersion: parsed.data.meta.sourceVersion,
    exportedAt: parsed.data.meta.exportedAt,
    exportedBy: parsed.data.meta.exportedBy,
    warnings: parsed.warnings,
    codeAvailable: !existing,
    existingEditable,
    existingTitle: existing?.title ?? null,
  });
}

async function insertImportedForm(
  body: FormExportBody,
  preferredCode: string,
  actor: string | null,
): Promise<string> {
  // 書き出し元と同じコードが空いていれば使う（共有 URL が環境をまたいでも
  // 同じになるので、手順書や QR を作り直さずに済む）。埋まっていれば新規採番。
  let code = preferredCode;
  const taken = code
    ? await prisma.form.findUnique({ where: { code }, select: { code: true } })
    : { code: "" };
  if (!code || taken) code = await uniqueFormCode();

  // 別コードになった場合、自己参照の「関連レコード一覧」は書き出し元の
  // コードを指したままになる（黙って 0 件になる）ので張り替える。
  const fields = remapSelfReferences(body.fields, preferredCode, code);

  await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        code,
        title: body.title,
        description: body.description,
        kind: body.kind,
        respondentVisibility: body.respondentVisibility,
        approvalEnabled: body.approvalEnabled,
        allowMultiple: body.allowMultiple,
        responseEditMode: body.responseEditMode,
        // 受付期間は運ばない。取り込んだ側で決める。
        opensAt: null,
        closesAt: null,
        responseEditableUntil: null,
        currentVersion: 1,
        // 公開はするが、共有設定は空なので作成者以外には見えない。
        status: "PUBLISHED",
        createdBy: actor,
        updatedBy: actor,
      },
      select: { id: true },
    });
    await tx.formVersion.create({
      data: {
        formId: form.id,
        version: 1,
        schema: fields as unknown as object,
        publishedBy: actor,
      },
    });
  });
  return code;
}

/**
 * 取り込む。2 通り:
 *   - "new"     … 新しいフォームとして作る（既定）。
 *   - "version" … 同じコードの既存フォームに、新しいバージョンとして重ねる。
 *                 過去の回答は回答時点の版を指したままなので壊れない。
 */
export async function importForm(
  text: string,
  mode: "new" | "version" = "new",
): Promise<
  ActionResult<{ code: string; mode: "new" | "version"; version?: number }>
> {
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (text.length > MAX_IMPORT_BYTES)
    return actionError("ファイルが大きすぎます");

  const parsed = parseFormExport(text);
  if (!parsed.ok) return actionError(parsed.error);
  const { form: body, meta } = parsed.data;

  try {
    const actor = await getCurrentActorId();

    if (mode === "version") {
      if (!meta.sourceCode)
        return actionError("書き出し元のコードが無いので上書きできません");
      const gate = await requireFormEdit(meta.sourceCode);
      if (!gate.ok) return actionError(gate.error);

      const version = await prisma.$transaction(async (tx) => {
        const current = await tx.form.findUniqueOrThrow({
          where: { code: meta.sourceCode },
          select: { id: true, currentVersion: true },
        });
        const next = current.currentVersion + 1;
        await tx.formVersion.create({
          data: {
            formId: current.id,
            version: next,
            schema: body.fields as unknown as object,
            publishedBy: actor,
          },
        });
        await tx.form.update({
          where: { id: current.id },
          data: {
            title: body.title,
            description: body.description,
            kind: body.kind,
            respondentVisibility: body.respondentVisibility,
            approvalEnabled: body.approvalEnabled,
            allowMultiple: body.allowMultiple,
            responseEditMode: body.responseEditMode,
            currentVersion: next,
            status: "PUBLISHED",
            updatedBy: actor,
          },
        });
        return next;
      });

      await recordAudit({
        action: "UPDATE",
        tableName: "forms",
        recordId: meta.sourceCode,
        after: {
          note: `${meta.sourceEnv} から取り込み（バージョン ${version} として公開）`,
        },
      });
      revalidate(meta.sourceCode);
      return actionOk({ code: meta.sourceCode, mode: "version", version });
    }

    const code = await insertImportedForm(body, meta.sourceCode, actor);
    await recordAudit({
      action: "CREATE",
      tableName: "forms",
      recordId: code,
      after: {
        note: `${meta.sourceEnv} / ${meta.sourceCode} から取り込み`,
      },
    });
    revalidate(code);
    return actionOk({ code, mode: "new" });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "取り込みに失敗しました"));
  }
}

// ── 承認フロー（フォームごと） ──────────────────────────────────────────────
//
// 書類共通の承認設定（MS0B）ではなく、フォーム 1 件ごとに段を持つ。稟議・日報・
// 点検簿が同じ承認を共有する理由が無いため。エンジン側は依頼時に flow_snapshot
// へ写すので、進行中の依頼は後からフローを変えても影響を受けない。

const formFlowStepInput = z.object({
  nameJa: z.string().trim().min(1, "段の名前を入力してください").max(60),
  nameEn: z.string().trim().max(60).optional(),
  groupId: z.number().int().positive("承認グループを選んでください"),
  mode: z.enum(["ANY", "ALL"]),
});

/** フォームの承認フローをまるごと置き換える（段番号は 1..N で振り直す）。 */
export async function saveFormApprovalFlow(
  code: string,
  steps: unknown,
): Promise<ActionResult> {
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = z.array(formFlowStepInput).max(20).safeParse(steps);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? "承認フローが不正です",
    );

  // 承認グループの実在確認（消えたグループを指したまま保存させない）。
  const groupIds = [...new Set(parsed.data.map((s) => s.groupId))];
  if (groupIds.length > 0) {
    const found = await prisma.approvalGroup.count({
      where: { id: { in: groupIds }, isActive: true },
    });
    if (found !== groupIds.length)
      return actionError("使えない承認グループが含まれています");
  }

  try {
    const actor = await getCurrentActorId();
    await prisma.$transaction(async (tx) => {
      // 段番号を詰めて作り直す。進行中の依頼は flow_snapshot を見ているので
      // ここを消しても影響しない（既存フローと同じ扱い）。
      await tx.formApprovalStep.deleteMany({ where: { formId: gate.form.id } });
      if (parsed.data.length === 0) return;
      await tx.formApprovalStep.createMany({
        data: parsed.data.map((s, i) => ({
          formId: gate.form.id,
          stepNo: i + 1,
          name: { ja: s.nameJa, en: s.nameEn ?? "" },
          groupId: s.groupId,
          mode: s.mode,
        })),
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: `承認フローを更新（${parsed.data.length} 段）` },
    });
    revalidate(code);
    void actor;
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認フローの保存に失敗しました"));
  }
}

// ── ビルダー用の選択肢（関連レコード一覧の設定） ─────────────────────────────
//
// 項目キーは画面に出さない方針なので、「どのフォームの、どの項目と突き合わせるか」
// はラベルで選ばせる。そのための一覧をここで引く。

export interface FormOption {
  value: string;
  label: string;
}

/** 自分が読めるフォーム（関連レコード一覧の参照先候補）。 */
export async function searchFormOptions(query: string): Promise<FormOption[]> {
  const authz = await checkPermission("form", "READ");
  if (!authz.ok) return [];
  const q = query.trim();
  try {
    const rows = await prisma.form.findMany({
      where: {
        currentVersion: { gt: 0 },
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { code: true, title: true, createdBy: true },
    });
    const visible = await visibleOwnerIds(
      FORM_OWNER_TYPE,
      rows.map((r) => ({ ownerId: r.code, createdBy: r.createdBy })),
    );
    return rows
      .filter((r) => visible.has(r.code))
      .map((r) => ({ value: r.code, label: `${r.title}（${r.code}）` }));
  } catch {
    return [];
  }
}

/** 指定フォームの項目（公開中の版）。ラベルで選ばせるための一覧。 */
export async function fetchFormFieldOptions(
  code: string,
): Promise<FormOption[]> {
  const authz = await checkPermission("form", "READ");
  if (!authz.ok) return [];
  try {
    const form = await prisma.form.findUnique({
      where: { code },
      select: {
        code: true,
        createdBy: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });
    if (!form) return [];
    const access = await shareAccessFor(
      FORM_OWNER_TYPE,
      form.code,
      form.createdBy,
    );
    if (!access.canRead) return [];

    const parsed = parseFormFields(form.versions[0]?.schema ?? []);
    if (!parsed.ok) return [];
    return (
      parsed.fields
        // 表示専用の項目は突き合わせにも表示にも使えない。
        .filter((f) => f.type !== "related")
        .map((f) => ({ value: f.key, label: f.label.ja || f.key }))
    );
  } catch {
    return [];
  }
}
