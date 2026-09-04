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
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { loadApproveCapabilities } from "@/lib/approval-permissions";
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
  computeVisitedPath,
  type FormSectionDef,
  fieldsOnPath,
  parseFormSections,
} from "@/lib/form-branching";
import { notifyFormCompletion } from "@/lib/form-completion";
import {
  canEditResponse,
  type FormAnswerValue,
  type FormFieldDef,
  formAvailability,
  normalizeOrder,
  parseFormFields,
  shouldAutoRequestApproval,
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
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  replaceShareGrants,
  shareAccessFor,
  visibleOwnerIds,
} from "@/lib/share-grants";
import { isShareConditionFieldType } from "@/lib/share-grants-core";

const BASE_PATH = "/general/forms";

/**
 * 「1 人 1 回」のフォームで、同じ人の提出が既にあった（トランザクション内の
 * 判定）。読んでから書く 2 手にすると同時提出が両方通るので、フォーム行を
 * ロックした後にもう一度数え、あれば tx ごと戻すための印。
 */
class AlreadyRespondedError extends Error {}
const TASKS_PATH = "/general/tasks";
const FORM_OWNER_TYPE = "forms";

function revalidate(code?: string, responseNumber?: string) {
  revalidatePath(BASE_PATH);
  // 承認依頼中・未回答フォームは 未処理一覧 (CM01) にも出る。
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

function dateTimeOrNullSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .string()
    .nullable()
    .transform((v) => (v ? new Date(v) : null))
    .refine(
      (d) => d === null || !Number.isNaN(d.getTime()),
      tr("general.formsActions.invalidDateTime"),
    );
}

function formSettingsInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  const dateTime = dateTimeOrNullSchema(tr);
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, tr("general.formsActions.titleRequired"))
      .max(200),
    description: z.string().max(2000),
    kind: z.enum(["SURVEY", "REQUEST"]),
    respondentVisibility: z.enum(["SHOWN", "HIDDEN"]),
    approvalEnabled: z.boolean(),
    editableUntilFirstApproval: z.boolean().default(false),
    allowMultiple: z.boolean(),
    opensAt: dateTime,
    closesAt: dateTime,
    responseEditMode: z.enum(["NONE", "UNTIL_CLOSE", "UNTIL_DATE"]),
    responseEditableUntil: dateTime,
  });
}

export type FormSettingsInput = z.input<
  ReturnType<typeof formSettingsInputSchema>
>;

function shareGrantInputSchema() {
  return z.object({
    subjectType: z.enum(["EVERYONE", "PLANT", "ROLE", "USER"]),
    subjectId: z.string().nullable(),
    level: z.enum(["RESPOND", "READ", "EDIT", "MANAGE"]),
    // 「この条件に当てはまる回答だけ見せる」。READ 以外では replaceShareGrants が捨てる。
    conditionFieldKey: z.string().nullable().optional(),
    conditionValues: z.array(z.string().max(200)).max(50).optional(),
    conditionLabels: z.array(z.string().max(200)).max(50).optional(),
    // 完了通知（申請・報告のみ）。RESPOND に付いていても replaceShareGrants が捨てる。
    notifyOnComplete: z.boolean().optional(),
  });
}

export type ShareGrantInputDto = z.infer<
  ReturnType<typeof shareGrantInputSchema>
>;

/** 期間の前後関係など、単体では見られない整合を確かめる。 */
function checkWindows(
  v: z.infer<ReturnType<typeof formSettingsInputSchema>>,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) {
    return tr("general.formsActions.closesAfterOpens");
  }
  if (v.responseEditMode === "UNTIL_DATE" && !v.responseEditableUntil) {
    return tr("general.formsActions.editDeadlineRequired");
  }
  if (
    v.responseEditMode === "UNTIL_DATE" &&
    v.opensAt &&
    v.responseEditableUntil &&
    v.responseEditableUntil <= v.opensAt
  ) {
    return tr("general.formsActions.editDeadlineAfterOpens");
  }
  if (v.kind === "SURVEY" && v.approvalEnabled) {
    return tr("general.formsActions.approvalOnlyForRequestForms");
  }
  return null;
}

async function uniqueFormCode(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = generateCode(8);
    const hit = await prisma.form.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!hit) return code;
  }
  throw new Error(tr("general.formsActions.codeAllocationFailed"));
}

// ── 定義（作る側） ───────────────────────────────────────────────────────────

export async function createForm(
  input: FormSettingsInput,
): Promise<ActionResult<{ code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = formSettingsInputSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const invalid = checkWindows(parsed.data, tr);
  if (invalid) return actionError(invalid);

  try {
    const actor = await getCurrentActorId();
    const code = await uniqueFormCode(tr);
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
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.createFailed"), tr),
    );
  }
}

/** 編集できるのは form:UPDATE を持つ人のうち、そのフォームの EDIT 以上。 */
async function requireFormEdit(
  code: string,
): Promise<
  | { ok: true; form: { id: string; code: string; createdBy: string | null } }
  | { ok: false; error: string }
> {
  const tr = await getTranslations();
  const authz = await checkPermission("form", "UPDATE");
  if (!authz.ok) return { ok: false, error: authz.error };
  const form = await prisma.form.findUnique({
    where: { code },
    select: { id: true, code: true, createdBy: true },
  });
  if (!form)
    return { ok: false, error: tr("general.formsActions.formNotFound") };
  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canEdit)
    return {
      ok: false,
      error: tr("general.formsActions.noEditPermission"),
    };
  return { ok: true, form };
}

export async function updateFormSettings(
  code: string,
  input: FormSettingsInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = formSettingsInputSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const invalid = checkWindows(parsed.data, tr);
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
    return actionError(prismaErrorMessage(e, tr("common.couldNotSave"), tr));
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
  sections: unknown = [],
): Promise<ActionResult<{ version: number }>> {
  const tr = await getTranslations();
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = parseFormFields(fields, tr);
  if (!parsed.ok) return actionError(parsed.error);
  if (parsed.fields.length === 0)
    return actionError(tr("general.formsActions.addAtLeastOneField"));

  const ordered = normalizeOrder(parsed.fields);

  const sectionsParsed = parseFormSections(sections, ordered, tr);
  if (!sectionsParsed.ok) return actionError(sectionsParsed.error);
  // セクションを使うなら、全項目がどこかのセクションに属していること
  // （ビルダーは自然にそう組むが、取り込み等で崩れないようサーバ側でも見る）。
  if (
    sectionsParsed.sections.length > 0 &&
    ordered.some((f) => !f.sectionKey)
  ) {
    return actionError(tr("general.formsActions.everyFieldNeedsASection"));
  }

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
          sections: sectionsParsed.sections as unknown as object,
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
      after: {
        note: tr("general.formsActions.fieldsPublishedNote", { version }),
      },
    });
    revalidate(code);
    return actionOk({ version });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.publishFailed"), tr),
    );
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
  const tr = await getTranslations();
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);
  try {
    const current = await prisma.form.findUniqueOrThrow({
      where: { code },
      select: { status: true, currentVersion: true },
    });
    if (current.status === status) return actionOk();
    if (status === "PUBLISHED" && current.currentVersion === 0)
      return actionError(tr("general.formsActions.fieldsNotYetPublished"));

    await prisma.form.update({
      where: { code },
      data: { status, updatedBy: await getCurrentActorId() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: { note: formStatusNote(tr)[status] },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.updateFailed"), tr),
    );
  }
}

function formStatusNote(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Record<"DRAFT" | "PUBLISHED" | "ARCHIVED", string> {
  return {
    DRAFT: tr("general.formsActions.statusNoteDraft"),
    PUBLISHED: tr("general.formsActions.statusNotePublished"),
    ARCHIVED: tr("general.formsActions.statusNoteArchived"),
  };
}

/** 共有設定はまとめて置き換える（消し忘れによる権限の残留を防ぐ）。 */
export async function saveShareGrants(
  code: string,
  grants: ShareGrantInputDto[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("form", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const form = await prisma.form.findUnique({
    where: { code },
    select: { createdBy: true },
  });
  if (!form) return actionError(tr("general.formsActions.formNotFound"));
  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canManage)
    return actionError(tr("general.formsActions.noShareManagePermission"));

  const parsed = z.array(shareGrantInputSchema()).max(200).safeParse(grants);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("general.formsActions.invalidShareSettings"),
    );

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
      return actionError(tr("general.formsActions.invalidConditionField"));
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
      after: {
        note: tr("general.formsActions.shareSettingsUpdatedNote", {
          count: parsed.data.length,
        }),
      },
    });
    revalidate(code);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("general.formsActions.shareSettingsSaveFailed"),
        tr,
      ),
    );
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
  sections: FormSectionDef[];
}

async function loadRespondContext(
  code: string,
): Promise<{ ok: true; ctx: RespondContext } | { ok: false; error: string }> {
  const tr = await getTranslations();
  const userId = await sessionUserId();
  if (!userId)
    return { ok: false, error: tr("general.formsActions.loginRequired") };

  const form = await prisma.form.findUnique({
    where: { code },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!form)
    return { ok: false, error: tr("general.formsActions.formNotFound") };

  const access = await shareAccessFor(FORM_OWNER_TYPE, code, form.createdBy);
  if (!access.canRespond)
    return {
      ok: false,
      error: tr("general.formsActions.noRespondPermission"),
    };

  const parsed = parseFormFields(form.versions[0]?.schema ?? [], tr);
  if (!parsed.ok || parsed.fields.length === 0)
    return {
      ok: false,
      error: tr("general.formsActions.formNotYetPublished"),
    };
  const sectionsParsed = parseFormSections(
    form.versions[0]?.sections ?? [],
    parsed.fields,
    tr,
  );

  return {
    ok: true,
    ctx: {
      userId,
      form,
      fields: parsed.fields,
      sections: sectionsParsed.ok ? sectionsParsed.sections : [],
    },
  };
}

/**
 * 提出したら、そのまま承認依頼まで通す（申請・報告フォームのみ）。
 *
 * **提出＝申請**。以前は提出後に本人が回答詳細を開いて「承認依頼」を押す必要が
 * あり、その一手間が忘れられて申請が滞留していた。押す場所そのものを無くした。
 *
 * **承認フローが未設定なら何もしない** — 提出は成功させ、回答は SUBMITTED に
 * 留める。回答者はフォームの設定を直せないので、ここでエラーにすると回答者が
 * 詰む。代わりに監査ログへ理由を残し、フォーム詳細の承認タブが未設定を警告する
 * （利用者の判断で、手動の承認依頼ボタンは復活させない）。
 *
 * 起こす条件の判定は lib/form-schema.ts の shouldAutoRequestApproval が持つ
 * （純粋なので単体テストがある）。ここはその結果に従って I/O をするだけ。
 *
 * フローの開始に失敗した場合も提出自体は取り消さない — 出したものは残す。
 * **この関数は決して throw しない**。呼び出し元の try に巻き込むと、回答は
 * 保存できているのに「保存に失敗しました」と出てしまう。
 */
async function autoRequestApproval(
  form: { id: string; kind: string; approvalEnabled: boolean },
  responseNumber: string,
  actorId: string,
  history: unknown,
  prevStatus: string | null,
  asDraft: boolean,
): Promise<void> {
  if (!shouldAutoRequestApproval(form, prevStatus, asDraft)) return;
  const tr = await getTranslations();
  try {
    await startRequestedFlow(
      form,
      responseNumber,
      actorId,
      history,
      prevStatus,
      tr,
    );
  } catch (e) {
    // 依頼だけが落ちた。提出は成立しているので、記録だけ残して黙って抜ける。
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: tr("general.formsActions.approvalStartErrorNote", {
          reason: prismaErrorMessage(
            e,
            tr("general.formsActions.unknownCause"),
            tr,
          ),
        }),
      },
    }).catch(() => {});
  }
}

/** autoRequestApproval の本体（例外はあちらが受ける）。 */
async function startRequestedFlow(
  form: { id: string },
  responseNumber: string,
  actorId: string,
  history: unknown,
  prevStatus: string | null,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<void> {
  const missing = await assertFormFlowConfigured(form.id);
  if (missing) {
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: tr("general.formsActions.flowNotConfiguredNote", {
          reason: missing,
        }),
      },
    });
    return;
  }

  const started = await startApprovalFlow({
    targetType: "form_responses",
    targetId: responseNumber,
  });
  if (!started.ok) {
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: tr("general.formsActions.approvalStartFailedNote", {
          reason: started.error ?? tr("general.formsActions.unknownCause"),
        }),
      },
    });
    return;
  }

  await prisma.formResponse.update({
    where: { responseNumber },
    data: {
      status: "REQUESTED",
      // 差し戻しから出し直したときは、前回の差し戻しを引きずらない。
      rejectedAt: null,
      rejectReason: null,
      history: appendHistory(
        history,
        entry("REQUEST", actorId),
      ) as unknown as object,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "form_responses",
    recordId: responseNumber,
    before: { status: prevStatus ?? "SUBMITTED" },
    after: {
      status: "REQUESTED",
      note: tr("general.formsActions.approvalRequestedBySubmitNote"),
    },
  });
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
  const tr = await getTranslations();
  const loaded = await loadRespondContext(code);
  if (!loaded.ok) return actionError(loaded.error);
  const { userId, form, fields, sections } = loaded.ctx;

  const availability = formAvailability(form, new Date());
  if (availability !== "OPEN") {
    return actionError(
      availability === "SCHEDULED"
        ? tr("general.formsActions.formNotYetOpen")
        : tr("general.formsActions.formClosed"),
    );
  }

  if (!asDraft) {
    // どのセクションを実際に通ったかは、回答者の申告ではなくここで
    // 独自に再計算する（クライアントの画面遷移を信用しない）。スキップした
    // セクションの必須項目は提出をブロックしてはいけない。
    const visited = computeVisitedPath(sections, fields, answers);
    const relevant = fieldsOnPath(fields, sections, visited);
    const errors = validateAnswers(relevant, answers, tr);
    const first = Object.values(errors)[0];
    if (first) return actionError(first);
  }

  // 1 人 1 回の事前確認（読める理由を早く返すため）。最終判定は下の tx 内 —
  // ここだけだと 2 つの提出が同時に通る。
  if (!form.allowMultiple && !asDraft) {
    const existing = await prisma.formResponse.findFirst({
      where: { formId: form.id, submittedBy: userId, status: { not: "DRAFT" } },
      select: { responseNumber: true },
    });
    if (existing)
      return actionError(tr("general.formsActions.alreadyResponded"));
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
      // フォーム行のロックを取った後に数え直す。先に提出した側が commit して
      // いれば、ここで見えて負ける（READ COMMITTED で文ごとに最新を読む）。
      if (!form.allowMultiple && !asDraft) {
        const dup = await tx.formResponse.findFirst({
          where: {
            formId: form.id,
            submittedBy: userId,
            status: { not: "DRAFT" },
          },
          select: { id: true },
        });
        if (dup) throw new AlreadyRespondedError();
      }
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
        select: { responseNumber: true, history: true },
      });
    });

    await recordAudit({
      action: "CREATE",
      tableName: "form_responses",
      recordId: created.responseNumber,
      after: {
        note: asDraft
          ? tr("general.formsActions.draftSavedNote")
          : tr("general.formsActions.responseSubmittedNote"),
      },
    });
    // 申請・報告フォームは提出がそのまま申請 — ここで承認依頼まで通す。
    await autoRequestApproval(
      form,
      created.responseNumber,
      userId,
      created.history,
      null,
      asDraft,
    );
    // 承認を使わない申請・報告は提出が完了そのもの（日報・点検簿など）。
    // 承認を使うものは全段承認したときに actOnResponse から呼ぶ。実際に
    // 完了かどうかは notifyFormCompletion が状態を見て決める。
    if (form.kind === "REQUEST" && !asDraft)
      await notifyFormCompletion(created.responseNumber);
    revalidate(code, created.responseNumber);
    return actionOk({ responseNumber: created.responseNumber });
  } catch (e) {
    if (e instanceof AlreadyRespondedError)
      return actionError(tr("general.formsActions.alreadyResponded"));
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.responseSaveFailed"), tr),
    );
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
  const tr = await getTranslations();
  const userId = await sessionUserId();
  if (!userId) return actionError(tr("general.formsActions.loginRequired"));

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError(tr("f.page.responseNotFound"));

  // 承認が下りているかはサーバでしか分からない。**画面の判定を信用しない** —
  // 編集 URL を直接叩かれても、ここで同じ規則を通す。
  const firstApprovalDone =
    row.status === "REQUESTED" &&
    (await hasAnyApproval("form_responses", responseNumber, row.createdAt));
  if (!canEditResponse(row.form, row, userId, new Date(), firstApprovalDone)) {
    return actionError(tr("general.formsActions.responseNotEditable"));
  }

  const versionRow = await prisma.formVersion.findUnique({
    where: { formId_version: { formId: row.formId, version: row.version } },
    select: { schema: true, sections: true },
  });
  const fieldsParsed = parseFormFields(versionRow?.schema ?? [], tr);
  if (!fieldsParsed.ok)
    return actionError(tr("general.formsActions.couldNotLoadFormDef"));
  const sectionsParsed = parseFormSections(
    versionRow?.sections ?? [],
    fieldsParsed.fields,
    tr,
  );
  const sections = sectionsParsed.ok ? sectionsParsed.sections : [];

  const wasDraft = row.status === "DRAFT";
  // 下書きに戻す道は用意しない（提出済みを引っ込めるのは承認の取り消しであって
  // 編集ではない）。下書きでない回答に asDraft を渡すのは呼び違い。
  if (asDraft && !wasDraft)
    return actionError(tr("general.formsActions.cannotRevertToDraft"));

  if (!asDraft) {
    // submitResponse と同じ規則: 実際に通ったセクションだけを検証する
    // （回答者の申告ではなく、この回答自体からサーバー側で再計算する）。
    const visited = computeVisitedPath(sections, fieldsParsed.fields, answers);
    const relevant = fieldsOnPath(fieldsParsed.fields, sections, visited);
    const errors = validateAnswers(relevant, answers, tr);
    const first = Object.values(errors)[0];
    if (first) return actionError(first);
  }

  // 下書きを提出に切り替える瞬間だけ、新規提出と同じ関門を通す。
  if (wasDraft && !asDraft) {
    const availability = formAvailability(row.form, new Date());
    if (availability !== "OPEN")
      return actionError(
        availability === "SCHEDULED"
          ? tr("general.formsActions.formNotYetOpen")
          : tr("general.formsActions.formClosed"),
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
      if (existing)
        return actionError(tr("general.formsActions.alreadyResponded"));
    }
  }

  const action = asDraft ? "DRAFT" : wasDraft ? "SUBMIT" : "UPDATE";
  const nextHistory = appendHistory(row.history, entry(action, userId));
  try {
    await prisma.$transaction(async (tx) => {
      if (wasDraft && !asDraft && !row.form.allowMultiple) {
        // 下書きの提出も新規提出（submitResponse の recordSeq 更新）と同じ
        // フォーム行のロックで直列化し、取った後に「1 人 1 回」を数え直す。
        await tx.$queryRaw`
          SELECT id FROM app.forms
          WHERE id = ${row.formId}::uuid
          FOR UPDATE`;
        const dup = await tx.formResponse.findFirst({
          where: {
            formId: row.formId,
            submittedBy: userId,
            status: { not: "DRAFT" },
          },
          select: { id: true },
        });
        if (dup) throw new AlreadyRespondedError();
      }
      await tx.formResponse.update({
        where: { responseNumber },
        data: {
          answers: answers as unknown as object,
          plainText: toPlainAnswers(fieldsParsed.fields, answers),
          ...(wasDraft && !asDraft
            ? { status: "SUBMITTED" as const, submittedAt: new Date() }
            : {}),
          history: nextHistory as unknown as object,
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: asDraft
          ? tr("general.formsActions.draftSavedNote2")
          : wasDraft
            ? tr("general.formsActions.draftSubmittedNote")
            : tr("general.formsActions.responseEditedNote"),
      },
    });
    // 下書きの提出と、差し戻しを直しての保存は「いま出した」— 承認依頼まで通す。
    // 依頼中の編集では起こさない（進行中のフローを張り直さないため）。
    await autoRequestApproval(
      row.form,
      responseNumber,
      userId,
      nextHistory,
      row.status,
      asDraft,
    );
    // 承認を使わない申請・報告の「提出」も完了。既に知らせた相手には
    // 送り直さない（form_completion_notices の unique が最終防衛線）。
    if (row.form.kind === "REQUEST" && !asDraft)
      await notifyFormCompletion(responseNumber);
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    if (e instanceof AlreadyRespondedError)
      return actionError(tr("general.formsActions.alreadyResponded"));
    return actionError(
      prismaErrorMessage(
        e,
        tr("general.formsActions.responseUpdateFailed"),
        tr,
      ),
    );
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
  const tr = await getTranslations();
  const userId = await sessionUserId();
  if (!userId) return actionError(tr("general.formsActions.loginRequired"));

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    select: {
      status: true,
      submittedBy: true,
      form: { select: { code: true } },
    },
  });
  if (!row) return actionError(tr("general.formsActions.draftNotFound"));
  if (row.submittedBy !== userId || row.status !== "DRAFT")
    return actionError(tr("general.formsActions.draftNotDeletable"));

  try {
    await prisma.formResponse.delete({ where: { responseNumber } });
    await recordAudit({
      action: "DELETE",
      tableName: "form_responses",
      recordId: responseNumber,
      before: { note: tr("general.formsActions.draftDeletedNote") },
    });
    revalidate(row.form.code);
    return actionOk({ code: row.form.code });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.draftDeleteFailed"), tr),
    );
  }
}

async function actOnResponse(
  responseNumber: string,
  action: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 承認できるかは「その書類を読める/直せる」+ 承認グループ所属の 2 段。
  const authz = await checkApprovalDocAccess("form");
  if (!authz.ok) return actionError(authz.error);

  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: { form: true },
  });
  if (!row) return actionError(tr("f.page.responseNotFound"));
  if (row.status !== "REQUESTED")
    return actionError(tr("general.formsActions.responseNotPendingApproval"));

  const result = await actOnCurrentStep({
    targetType: "form_responses",
    targetId: responseNumber,
    action,
    comment,
  });
  if (!result.ok)
    return actionError(result.error ?? tr("common.theOperationFailed"));

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
              ? tr("general.formsActions.approvedAllStepsDoneNote")
              : tr("general.formsActions.approvedNextStepNote")
            : tr("general.formsActions.sentBackNote", {
                comment: comment ?? "",
              }),
      },
    });
    // 全段の承認が下りた = 申請の完了。共有設定で「完了時に通知」を付けた
    // 相手へ知らせる（依頼者本人への承認結果は approvals.ts が別に送る）。
    if (action === "APPROVED" && done)
      await notifyFormCompletion(responseNumber);
    revalidate(row.form.code, responseNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.theOperationFailed"), tr),
    );
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
  const tr = await getTranslations();
  const trimmed = reason.trim();
  if (!trimmed)
    return actionError(tr("general.formsActions.enterRejectReason"));
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
  const tr = await getTranslations();
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (text.length > MAX_IMPORT_BYTES)
    return actionError(tr("general.formsActions.fileTooLarge"));

  const parsed = parseFormExport(text, tr);
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
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string> {
  // 書き出し元と同じコードが空いていれば使う（共有 URL が環境をまたいでも
  // 同じになるので、手順書や QR を作り直さずに済む）。埋まっていれば新規採番。
  let code = preferredCode;
  const taken = code
    ? await prisma.form.findUnique({ where: { code }, select: { code: true } })
    : { code: "" };
  if (!code || taken) code = await uniqueFormCode(tr);

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
        // セクションの key はフォーム内部の話（他フォームを参照しない）なので、
        // remapSelfReferences のような張り替えは要らない。
        sections: body.sections as unknown as object,
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
  const tr = await getTranslations();
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (text.length > MAX_IMPORT_BYTES)
    return actionError(tr("general.formsActions.fileTooLarge"));

  const parsed = parseFormExport(text, tr);
  if (!parsed.ok) return actionError(parsed.error);
  const { form: body, meta } = parsed.data;

  try {
    const actor = await getCurrentActorId();

    if (mode === "version") {
      if (!meta.sourceCode)
        return actionError(tr("general.formsActions.noSourceCodeToOverwrite"));
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
            sections: body.sections as unknown as object,
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
          note: tr("general.formsActions.importedAsVersionNote", {
            sourceEnv: meta.sourceEnv,
            version,
          }),
        },
      });
      revalidate(meta.sourceCode);
      return actionOk({ code: meta.sourceCode, mode: "version", version });
    }

    const code = await insertImportedForm(body, meta.sourceCode, actor, tr);
    await recordAudit({
      action: "CREATE",
      tableName: "forms",
      recordId: code,
      after: {
        note: tr("general.formsActions.importedAsNewNote", {
          sourceEnv: meta.sourceEnv,
          sourceCode: meta.sourceCode,
        }),
      },
    });
    revalidate(code);
    return actionOk({ code, mode: "new" });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("general.formsActions.importFailed"), tr),
    );
  }
}

// ── 承認フロー（フォームごと） ──────────────────────────────────────────────
//
// 書類共通の承認設定（MS0B）ではなく、フォーム 1 件ごとに段を持つ。稟議・日報・
// 点検簿が同じ承認を共有する理由が無いため。エンジン側は依頼時に flow_snapshot
// へ写すので、進行中の依頼は後からフローを変えても影響を受けない。

function formFlowStepInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z
    .object({
      nameJa: z
        .string()
        .trim()
        .min(1, tr("general.formsActions.stepNameRequired"))
        .max(60),
      nameTranslations: z.record(z.string(), z.string()).optional(),
      // 宛先はグループか「カスタム（1..N 人の指名）」のどちらか一方。
      groupId: z.number().int().positive().nullable().optional(),
      approverUserIds: z.array(z.string().uuid()).max(50).optional(),
      mode: z.enum(["ANY", "ALL"]),
    })
    .refine((v) => !!v.groupId !== (v.approverUserIds ?? []).length > 0, {
      message: tr("general.formsActions.stepTargetRequired"),
    });
}

/** フォームの承認フローをまるごと置き換える（段番号は 1..N で振り直す）。 */
export async function saveFormApprovalFlow(
  code: string,
  steps: unknown,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await requireFormEdit(code);
  if (!gate.ok) return actionError(gate.error);

  const parsed = z.array(formFlowStepInputSchema(tr)).max(20).safeParse(steps);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ??
        tr("general.formsActions.invalidApprovalFlow"),
    );

  // 宛先の実在確認（消えたグループ・停止したユーザーを指したまま保存させない）。
  const groupIds = [
    ...new Set(parsed.data.map((s) => s.groupId).filter((v) => v != null)),
  ];
  if (groupIds.length > 0) {
    const found = await prisma.approvalGroup.count({
      where: { id: { in: groupIds }, isActive: true },
    });
    if (found !== groupIds.length)
      return actionError(tr("general.formsActions.invalidApprovalGroups"));
  }
  const userIds = [
    ...new Set(parsed.data.flatMap((s) => s.approverUserIds ?? [])),
  ];
  if (userIds.length > 0) {
    const found = await prisma.user.count({
      where: { id: { in: userIds }, isActive: true },
    });
    if (found !== userIds.length)
      return actionError(tr("general.formsActions.invalidApprovers"));
  }

  try {
    const actor = await getCurrentActorId();
    await prisma.$transaction(async (tx) => {
      // 段番号を詰めて作り直す。進行中の依頼は flow_snapshot を見ているので
      // ここを消しても影響しない（既存フローと同じ扱い）。
      await tx.formApprovalStep.deleteMany({ where: { formId: gate.form.id } });
      // 承認者は子テーブルなので createMany では張れない。段ごとに作る
      // （段数は上限 20 なのでループで足りる）。
      for (const [i, step] of parsed.data.entries()) {
        const created = await tx.formApprovalStep.create({
          data: {
            formId: gate.form.id,
            stepNo: i + 1,
            name: localizedInput(step.nameJa, undefined, step.nameTranslations),
            groupId: step.groupId ?? null,
            mode: step.mode,
          },
          select: { id: true },
        });
        const approvers = step.approverUserIds ?? [];
        if (approvers.length > 0) {
          await tx.formApprovalStepApprover.createMany({
            data: approvers.map((userId, order) => ({
              stepId: created.id,
              userId,
              sortOrder: order,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "forms",
      recordId: code,
      after: {
        note: tr("general.formsActions.approvalFlowUpdatedNote", {
          count: parsed.data.length,
        }),
      },
    });
    revalidate(code);
    void actor;
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("general.formsActions.approvalFlowSaveFailed"),
        tr,
      ),
    );
  }
}

/**
 * 個人を承認者に指すときの検索。
 *
 * 「承認できるか」を**選ぶ時点で**出す — フォームを開けない人を承認者にしても
 * 承認できず、依頼が誰にも進められないまま止まる。あとで気付くのでは遅い。
 */
export async function searchFormApproverOptions(
  query: string,
): Promise<{ value: string; label: string; allowed: boolean }[]> {
  const authz = await checkPermission("form", "READ");
  if (!authz.ok) return [];
  const q = query.trim();
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { displayName: { contains: q, mode: "insensitive" as const } },
                { username: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { username: "asc" },
      take: 30,
      select: { id: true, displayName: true, username: true },
    });
    if (users.length === 0) return [];
    const caps = await loadApproveCapabilities(
      users.map((u) => u.id),
      ["form"],
    );
    return users.map((u) => ({
      value: u.id,
      label: u.displayName || u.username,
      allowed: caps.get(u.id)?.get("form")?.allowed ?? false,
    }));
  } catch {
    return [];
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
  const tr = await getTranslations();
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

    const parsed = parseFormFields(form.versions[0]?.schema ?? [], tr);
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
