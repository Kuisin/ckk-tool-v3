/**
 * form-transfer.ts — フォーム定義の書き出し / 取り込み（環境をまたぐ移送）。
 *
 * dev で作って本番へ持っていく、逆に本番のものを dev へ複製して直す、という
 * 往復のための形式。**定義だけ**を運び、回答は運ばない。
 *
 * 運ばないもの（意図的）:
 *   - 回答（form_responses）… 環境ごとの実データ。移送の対象ではない。
 *   - 共有設定（share_grants）… 拠点 id・ロール id・ユーザー id を指しており、
 *     dev と本番で同じものを指す保証が無い。取り込んだフォームは**非公開**で
 *     始まり、共有は取り込んだ側で設定し直す（安全側に倒す）。
 *   - 承認フロー … per-form ではなく承認設定 (MS0B) が書類種別ごとに持つ。
 *
 * 形式は「# で始まる読める見出し + JSON 本体」。拡張子は .txt。JSON だけだと
 * 何のファイルか分からず、メールやチャットで転送されたときに迷うので見出しを
 * 付けてある。取り込み側は # 行を読み飛ばすので、JSON だけを貼っても通る。
 *
 * 純関数（I/O なし）。**呼び出し側が next-intl の `tr` を渡す**
 * （`getTranslations()` が要るリクエストスコープの外では呼ばれないため、
 * 呼び出し元の Route Handler / Server Action で解決済みの `tr` をそのまま
 * 受け取る — `lib/format.ts` の `Formatters` と同じ約束）。
 */

import { type FormSectionDef, parseFormSections } from "./form-branching";
import { type FormFieldDef, parseFormFields } from "./form-schema";
import type { Tr } from "./i18n";

/** 形式の版。破壊的に変えるときに上げる（取り込み側が弾けるように）。 */
export const FORM_EXPORT_FORMAT = 1;

export interface FormExportMeta {
  formatVersion: number;
  /** 書き出した環境（dev / main）。 */
  sourceEnv: string;
  /** 書き出し元のフォームコード。取り込み側は空いていれば同じコードを使う。 */
  sourceCode: string;
  /** 書き出した時点の定義バージョン。 */
  sourceVersion: number;
  exportedAt: string;
  exportedBy: string | null;
  appVersion: string | null;
  /** 本体（form）の壊れ検知。チャット貼り付けでの欠けを見つけるため。 */
  checksum: string;
}

export interface FormExportBody {
  title: string;
  description: string | null;
  kind: "SURVEY" | "REQUEST";
  respondentVisibility: "SHOWN" | "HIDDEN";
  approvalEnabled: boolean;
  allowMultiple: boolean;
  /**
   * 受付期間は**運ばない**（日時は環境ごとの運用で決まる）。取り込んだ側で
   * 設定し直す。編集期限のモードだけは設計意図なので運ぶ。
   */
  responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
  fields: FormFieldDef[];
  /** セクション（複数ページ）。空 = セクション未使用。 */
  sections: FormSectionDef[];
}

export interface FormExport {
  meta: FormExportMeta;
  form: FormExportBody;
}

/**
 * FNV-1a 32bit。暗号用途ではなく、貼り付けで途中が欠けたのを見つけるだけ。
 * 依存を増やさずどこでも動くものが要るので自前。
 */
export function checksumOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // 32bit の FNV prime 倍。オーバーフローは >>> 0 で畳む。
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** チェックサムの対象は本体だけ（meta を含めると自己参照になる）。 */
function canonicalBody(form: FormExportBody): string {
  return JSON.stringify(form);
}

export function buildFormExport(input: {
  sourceEnv: string;
  sourceCode: string;
  sourceVersion: number;
  exportedAt: string;
  exportedBy: string | null;
  appVersion: string | null;
  form: FormExportBody;
}): FormExport {
  return {
    meta: {
      formatVersion: FORM_EXPORT_FORMAT,
      sourceEnv: input.sourceEnv,
      sourceCode: input.sourceCode,
      sourceVersion: input.sourceVersion,
      exportedAt: input.exportedAt,
      exportedBy: input.exportedBy,
      appVersion: input.appVersion,
      checksum: checksumOf(canonicalBody(input.form)),
    },
    form: input.form,
  };
}

const HEADER_PREFIX = "#";

export function serializeFormExport(data: FormExport, tr: Tr): string {
  const head = [
    `# ${tr("general.formsActions.transferHeaderTitle")}`,
    `# ${tr("general.formsActions.transferHeaderFieldTitle")} : ${data.form.title}`,
    `# ${tr("general.formsActions.transferHeaderFieldKind")}     : ${
      data.form.kind === "REQUEST"
        ? tr("common.requestOrReport")
        : tr("common.survey")
    }`,
    `# ${tr("general.formsActions.transferHeaderFieldCount")}   : ${data.form.fields.length}`,
    `# ${tr("general.formsActions.transferHeaderSource")}: ${data.meta.sourceEnv} / ${data.meta.sourceCode} (v${data.meta.sourceVersion})`,
    `# ${tr("general.formsActions.transferHeaderExportedAt")}: ${data.meta.exportedAt}`,
    "#",
    `# ${tr("general.formsActions.transferHeaderNote1")}`,
    `# ${tr("general.formsActions.transferHeaderNote2")}`,
    `# ${tr("general.formsActions.transferHeaderNote3")}`,
    `# ${tr("general.formsActions.transferHeaderNote4")}`,
    "",
  ].join("\n");
  return `${head}${JSON.stringify(data, null, 2)}\n`;
}

export type ParseResult =
  | { ok: true; data: FormExport; warnings: string[] }
  | { ok: false; error: string };

/** 先頭の # 行を落として JSON 本体だけにする。 */
function stripHeader(text: string): string {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (
    i < lines.length &&
    (lines[i].trim() === "" || lines[i].trimStart().startsWith(HEADER_PREFIX))
  ) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

export function parseFormExport(text: string, tr: Tr): ParseResult {
  const body = stripHeader(text ?? "");
  if (!body) {
    return { ok: false, error: tr("general.formsActions.transferEmptyBody") };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return {
      ok: false,
      error: tr("general.formsActions.transferInvalidJson"),
    };
  }

  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      error: tr("general.formsActions.transferWrongFormat"),
    };
  }
  const obj = raw as { meta?: unknown; form?: unknown };
  if (typeof obj.meta !== "object" || obj.meta === null) {
    return {
      ok: false,
      error: tr("general.formsActions.transferNotAFormFile"),
    };
  }
  const meta = obj.meta as Partial<FormExportMeta>;

  if (typeof meta.formatVersion !== "number") {
    return {
      ok: false,
      error: tr("general.formsActions.transferNotAFormFile"),
    };
  }
  if (meta.formatVersion > FORM_EXPORT_FORMAT) {
    return {
      ok: false,
      error: tr("general.formsActions.transferNewerFormat", {
        version: meta.formatVersion,
      }),
    };
  }

  const form = obj.form as Partial<FormExportBody> | undefined;
  if (!form || typeof form.title !== "string" || !form.title.trim()) {
    return { ok: false, error: tr("general.formsActions.transferNoTitle") };
  }
  if (form.kind !== "SURVEY" && form.kind !== "REQUEST") {
    return {
      ok: false,
      error: tr("general.formsActions.transferInvalidKind"),
    };
  }

  const parsedFields = parseFormFields(form.fields ?? [], tr);
  if (!parsedFields.ok) {
    return {
      ok: false,
      error: tr("general.formsActions.transferInvalidFields", {
        reason: parsedFields.error,
      }),
    };
  }
  // セクションが壊れていても取り込みは止めない — 空扱い（=セクション未使用）
  // に落として項目だけは持ち込める。旧版（sections が無い）ファイルも同じ
  // 経路で「空 = 未使用」になる。
  const parsedSections = parseFormSections(
    form.sections ?? [],
    parsedFields.fields,
    tr,
  );

  const normalized: FormExportBody = {
    title: form.title.trim(),
    description: typeof form.description === "string" ? form.description : null,
    kind: form.kind,
    respondentVisibility:
      form.respondentVisibility === "HIDDEN" ? "HIDDEN" : "SHOWN",
    approvalEnabled: form.approvalEnabled === true,
    allowMultiple: form.allowMultiple !== false,
    responseEditMode:
      form.responseEditMode === "UNTIL_CLOSE" ||
      form.responseEditMode === "UNTIL_DATE"
        ? form.responseEditMode
        : "NONE",
    fields: parsedFields.fields,
    sections: parsedSections.ok ? parsedSections.sections : [],
  };

  const warnings: string[] = [];
  if (
    typeof meta.checksum === "string" &&
    meta.checksum !== checksumOf(canonicalBody(normalized))
  ) {
    // 弾かずに警告に留める: 旧版で書き出した後に仕様が増えた場合など、
    // 内容が正しくても一致しないことがある。人が見て判断できればよい。
    warnings.push(tr("general.formsActions.transferChecksumMismatch"));
  }
  warnings.push(...portabilityWarnings(normalized.fields, tr));

  return {
    ok: true,
    data: {
      meta: {
        formatVersion: meta.formatVersion,
        sourceEnv: typeof meta.sourceEnv === "string" ? meta.sourceEnv : "?",
        sourceCode: typeof meta.sourceCode === "string" ? meta.sourceCode : "",
        sourceVersion:
          typeof meta.sourceVersion === "number" ? meta.sourceVersion : 0,
        exportedAt: typeof meta.exportedAt === "string" ? meta.exportedAt : "",
        exportedBy:
          typeof meta.exportedBy === "string" ? meta.exportedBy : null,
        appVersion:
          typeof meta.appVersion === "string" ? meta.appVersion : null,
        checksum: typeof meta.checksum === "string" ? meta.checksum : "",
      },
      form: normalized,
    },
    warnings,
  };
}

/**
 * 自分自身を参照する「関連レコード一覧」の参照先を、取り込み後のコードへ
 * 張り替える。
 *
 * WHY: 取り込みは書き出し元と同じコードを使おうとするが、そのコードが埋まって
 * いれば新しいコードで作る。このとき自己参照はもとのコードを指したままになり、
 * **エラーも出さずに常に 0 件**を表示する（参照先が別環境の別フォームなら、
 * もっと悪く、他人のフォームを指す）。他フォームへの参照は意図的な外部参照
 * なので触らない。
 */
export function remapSelfReferences(
  fields: readonly FormFieldDef[],
  fromCode: string,
  toCode: string,
): FormFieldDef[] {
  if (!fromCode || fromCode === toCode) return [...fields];
  return fields.map((f) =>
    f.type === "related" && f.related?.targetFormCode === fromCode
      ? { ...f, related: { ...f.related, targetFormCode: toCode } }
      : f,
  );
}

/**
 * 環境をまたぐと外れるかもしれない参照を洗い出す。取り込みは止めない —
 * 直せるのは取り込んだ側の人なので、何を直すべきかだけ伝える。
 */
export function portabilityWarnings(
  fields: readonly FormFieldDef[],
  tr: Tr,
): string[] {
  const warnings: string[] = [];
  const related = fields.filter((f) => f.type === "related");
  for (const field of related) {
    const target = field.related?.targetFormCode;
    const label = field.label.ja || field.key;
    warnings.push(
      target
        ? tr("general.formsActions.transferRelatedFieldWarning", {
            label,
            target,
          })
        : tr("general.formsActions.transferRelatedFieldNoTarget", { label }),
    );
  }
  if (fields.some((f) => f.type === "attachment")) {
    warnings.push(tr("general.formsActions.transferAttachmentNotCarried"));
  }
  return warnings;
}

/** 書き出しファイル名。`フォーム_タイトル_dev_ABCD1234.txt` の形。 */
export function exportFileName(
  title: string,
  sourceEnv: string,
  sourceCode: string,
  tr: Tr,
): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    // 空白は _ に畳む。連続を 1 つにしないと「_ _ _」のような名前になる。
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const prefix = tr("general.formsActions.transferFileNamePrefix");
  const untitled = tr("general.formsActions.transferUntitled");
  return `${prefix}_${safe || untitled}_${sourceEnv}_${sourceCode}.txt`;
}
