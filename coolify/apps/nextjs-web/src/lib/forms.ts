import "server-only";

/**
 * forms.ts — フォーム (CM02) の読み取り。書き込みは
 * app/(dashboard)/general/forms/actions.ts が持つ。
 *
 * 可視性の考え方:
 *   - 権限コード `form` は「フォームを作る側」の門番。
 *   - 「この 1 件を誰が回答・閲覧できるか」は share_grants（lib/share-grants.ts）。
 *   - 既定は非公開 — 共有行が 1 つも無ければ、作成者と system:ADMIN 以外には
 *     見えない。URL（/f/<code>）を知っていても同じ。
 */

import { cache } from "react";
import { sessionUserId } from "./authz";
import { prisma } from "./db";
import {
  type FormAnswerValue,
  type FormAvailability,
  type FormFieldDef,
  formAvailability,
  parseFormFields,
} from "./form-schema";
import {
  type ShareAccess,
  shareAccessFor,
  visibleOwnerIds,
} from "./share-grants";

export const FORM_OWNER_TYPE = "forms";
export const RESPONSE_OWNER_TYPE = "form_responses";

export interface FormRow {
  code: string;
  title: string;
  kind: "SURVEY" | "REQUEST";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: FormAvailability;
  responseCount: number;
  opensAt: string | null;
  closesAt: string | null;
  updatedAt: string;
}

export interface FormDetailView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  kind: "SURVEY" | "REQUEST";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: FormAvailability;
  respondentVisibility: "SHOWN" | "HIDDEN";
  currentVersion: number;
  approvalEnabled: boolean;
  allowMultiple: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
  responseEditableUntil: Date | null;
  fields: FormFieldDef[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResponseRow {
  responseNumber: string;
  recordNo: number;
  status: string;
  /** respondentVisibility=HIDDEN のフォームでは null（サーバ側で落とす）。 */
  respondent: string | null;
  submittedAt: string | null;
  summary: string;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** 定義バージョンの schema を項目配列に戻す。壊れていたら空配列（画面は出す）。 */
function fieldsOf(schema: unknown): FormFieldDef[] {
  const parsed = parseFormFields(schema);
  return parsed.ok ? parsed.fields : [];
}

/**
 * 自分に見えるフォームの一覧。
 * 作成者・system:ADMIN・共有された人が対象で、共有ゼロのフォームは他人に出ない。
 */
export async function listForms(): Promise<FormRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  try {
    const rows = await prisma.form.findMany({
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        code: true,
        title: true,
        kind: true,
        status: true,
        opensAt: true,
        closesAt: true,
        updatedAt: true,
        createdBy: true,
        _count: { select: { responses: true } },
      },
    });
    const visible = await visibleOwnerIds(
      FORM_OWNER_TYPE,
      rows.map((r) => ({ ownerId: r.code, createdBy: r.createdBy })),
    );
    const now = new Date();
    return rows
      .filter((r) => visible.has(r.code) || r.createdBy === userId)
      .map((r) => ({
        code: r.code,
        title: r.title,
        kind: r.kind,
        status: r.status,
        availability: formAvailability(
          { status: r.status, opensAt: r.opensAt, closesAt: r.closesAt },
          now,
        ),
        responseCount: r._count.responses,
        opensAt: toIso(r.opensAt),
        closesAt: toIso(r.closesAt),
        updatedAt: r.updatedAt.toISOString(),
      }));
  } catch {
    return [];
  }
}

/** フォーム 1 件（公開中バージョンの項目つき）。存在しなければ null。 */
export const fetchForm = cache(
  async (code: string): Promise<FormDetailView | null> => {
    const row = await prisma.form.findUnique({
      where: { code },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      kind: row.kind,
      status: row.status,
      availability: formAvailability(
        { status: row.status, opensAt: row.opensAt, closesAt: row.closesAt },
        new Date(),
      ),
      respondentVisibility: row.respondentVisibility,
      currentVersion: row.currentVersion,
      approvalEnabled: row.approvalEnabled,
      allowMultiple: row.allowMultiple,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      responseEditMode: row.responseEditMode,
      responseEditableUntil: row.responseEditableUntil,
      fields: fieldsOf(row.versions[0]?.schema ?? []),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
);

/** 特定バージョンの項目定義（回答表示は必ず回答時点の版で描く）。 */
export async function fetchFormVersionFields(
  formId: string,
  version: number,
): Promise<FormFieldDef[]> {
  const row = await prisma.formVersion.findUnique({
    where: { formId_version: { formId, version } },
    select: { schema: true },
  });
  return fieldsOf(row?.schema ?? []);
}

/** このフォームに対する自分の権限。 */
export async function formAccess(form: {
  code: string;
  createdBy: string | null;
}): Promise<ShareAccess> {
  return shareAccessFor(FORM_OWNER_TYPE, form.code, form.createdBy);
}

/** 回答一覧（respondentVisibility=HIDDEN なら回答者を載せない）。 */
export async function listResponses(
  form: FormDetailView,
): Promise<ResponseRow[]> {
  try {
    const rows = await prisma.formResponse.findMany({
      where: { formId: form.id, status: { not: "DRAFT" } },
      orderBy: { recordNo: "desc" },
      take: 500,
      select: {
        responseNumber: true,
        recordNo: true,
        status: true,
        plainText: true,
        submittedAt: true,
        submittedByUser: { select: { displayName: true, username: true } },
      },
    });
    return rows.map((r) => ({
      responseNumber: r.responseNumber,
      recordNo: r.recordNo,
      status: r.status,
      // HIDDEN のフォームでは props に載せない — クライアントへ送ってから
      // 隠すのは事故のもと。
      respondent:
        form.respondentVisibility === "HIDDEN"
          ? null
          : r.submittedByUser.displayName || r.submittedByUser.username,
      submittedAt: toIso(r.submittedAt),
      summary: (r.plainText ?? "").split("\n").slice(0, 2).join(" / "),
    }));
  } catch {
    return [];
  }
}

export interface ResponseDetailView {
  responseNumber: string;
  recordNo: number;
  status: string;
  answers: Record<string, FormAnswerValue>;
  version: number;
  submittedBy: string;
  respondent: string | null;
  submittedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  form: FormDetailView;
  fields: FormFieldDef[];
}

export async function fetchResponse(
  responseNumber: string,
): Promise<ResponseDetailView | null> {
  const row = await prisma.formResponse.findUnique({
    where: { responseNumber },
    include: {
      form: true,
      submittedByUser: { select: { displayName: true, username: true } },
    },
  });
  if (!row) return null;
  const form = await fetchForm(row.form.code);
  if (!form) return null;
  const fields = await fetchFormVersionFields(row.formId, row.version);
  return {
    responseNumber: row.responseNumber,
    recordNo: row.recordNo,
    status: row.status,
    answers: (row.answers ?? {}) as Record<string, FormAnswerValue>,
    version: row.version,
    submittedBy: row.submittedBy,
    respondent:
      form.respondentVisibility === "HIDDEN"
        ? null
        : row.submittedByUser.displayName || row.submittedByUser.username,
    submittedAt: row.submittedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    form,
    fields,
  };
}

/** 関連レコード一覧（related 項目）を解決する。読めない項目は空で返す。 */
export async function resolveRelatedRecords(
  field: FormFieldDef,
  ownValue: FormAnswerValue,
): Promise<{ headers: string[]; rows: { number: string; cells: string[] }[] }> {
  const cfg = field.related;
  if (!cfg || ownValue == null) return { headers: [], rows: [] };
  const key =
    typeof ownValue === "object" && "id" in ownValue
      ? String((ownValue as { id: string }).id)
      : String(ownValue);
  if (!key) return { headers: [], rows: [] };

  try {
    const target = await prisma.form.findUnique({
      where: { code: cfg.targetFormCode },
      select: { id: true, createdBy: true, code: true },
    });
    if (!target) return { headers: [], rows: [] };
    // 参照先フォームを読む権限が無ければ何も出さない（横断で覗けてしまうため）。
    const access = await shareAccessFor(
      FORM_OWNER_TYPE,
      target.code,
      target.createdBy,
    );
    if (!access.canRead) return { headers: [], rows: [] };

    const rows = await prisma.formResponse.findMany({
      where: { formId: target.id, status: { not: "DRAFT" } },
      orderBy: { recordNo: "desc" },
      take: Math.min(cfg.limit, 100),
      select: { responseNumber: true, answers: true },
    });

    const matched = rows.filter((r) => {
      const a = (r.answers ?? {}) as Record<string, FormAnswerValue>;
      const v = a[cfg.targetFieldKey];
      const id =
        typeof v === "object" && v != null && "id" in v
          ? String((v as { id: string }).id)
          : String(v ?? "");
      return id === key;
    });

    return {
      headers: cfg.columns,
      rows: matched.map((r) => {
        const a = (r.answers ?? {}) as Record<string, FormAnswerValue>;
        return {
          number: r.responseNumber,
          cells: cfg.columns.map((c) => {
            const v = a[c];
            if (v == null) return "";
            if (typeof v === "string") return v;
            if (Array.isArray(v))
              return v.filter((x) => typeof x === "string").join(", ");
            if (typeof v === "object" && "label" in v)
              return String((v as { label: unknown }).label ?? "");
            return "";
          }),
        };
      }),
    };
  } catch {
    return { headers: [], rows: [] };
  }
}

// ─── CM01 承認・予定 のセクション用 ──────────────────────────────────────────

export interface PendingFormRow {
  code: string;
  title: string;
  closesAt: string | null;
}

export interface MyResponseRow {
  responseNumber: string;
  formCode: string;
  formTitle: string;
  recordNo: number;
  status: string;
  submittedAt: string | null;
  canEdit: boolean;
  editDeadline: string | null;
}
