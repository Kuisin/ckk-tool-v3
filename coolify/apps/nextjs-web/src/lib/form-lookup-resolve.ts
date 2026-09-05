import "server-only";

/**
 * form-lookup-resolve.ts — フォーム (CM02) の業務データ検索項目（lookup）の値を
 * **サーバー側でマスタに突き合わせる**。
 *
 * lookup の値は `{ id, label }` で、ラベルは選んだ時点のスナップショット。
 * 以前はクライアントが送ってきた label をそのまま保存していたので、細工した
 * payload で存在しない id や別の名前を書き込めた。ここで id を参照先の表で
 * 引き直し、ラベルはマスタの値で上書きする — 表示側（詳細・エクスポート・
 * 関連レコード一覧）は保存済みのラベルしか見ないので、入口で正しておく。
 *
 * ラベルの形は components/forms/lookup-dispatch.ts が束ねる検索
 * （app/(dashboard)/_shared/option-search.ts）と同じにする — 選んだときと
 * 保存後で表示が変わらないように。
 */

import { prisma } from "./db";
import { formatProductNumber } from "./doc-number";
import type {
  FormAnswerValue,
  FormFieldDef,
  LookupSource,
} from "./form-schema";
import { type LocalizedText, localized } from "./format";
import type { Tr } from "./i18n";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 整数 id（製品・素材・拠点など）。数字以外は存在しない id として扱う。 */
function intId(id: string): number | null {
  return /^\d{1,10}$/.test(id) ? Number(id) : null;
}

const nameCode = (name: unknown, code: string) =>
  `${localized(name as LocalizedText | null)}（${code}）`;

/**
 * 参照先の 1 件を id で引き、表示ラベルを返す。無ければ null。
 * 無効化された行も引く — 選んだあとに無効化されたものを提出で弾く理由はない
 * （検索の候補に出ないだけ）。
 */
export async function resolveLookupLabel(
  source: LookupSource,
  id: string,
): Promise<string | null> {
  switch (source) {
    case "user": {
      if (!UUID_RE.test(id)) return null;
      const r = await prisma.user.findUnique({
        where: { id },
        select: { displayName: true, username: true },
      });
      return r ? `${r.displayName}（${r.username}）` : null;
    }
    case "customer":
    case "business_partner": {
      if (!UUID_RE.test(id)) return null;
      const r = await prisma.businessPartner.findUnique({
        where: { id },
        select: { name: true },
      });
      return r ? localized(r.name as LocalizedText | null) : null;
    }
    case "product": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.product.findUnique({
        where: { id: n },
        select: { name: true, yearMonth: true, seq: true },
      });
      if (!r) return null;
      const code = formatProductNumber(r.yearMonth, r.seq);
      const name = localized(r.name as LocalizedText | null);
      return code ? `${name} ${code}` : name;
    }
    case "material": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.material.findUnique({
        where: { id: n },
        select: { code: true, name: true },
      });
      return r
        ? `${r.code}（${localized(r.name as LocalizedText | null)}）`
        : null;
    }
    case "material_type": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.materialType.findUnique({
        where: { id: n },
        select: { name: true },
      });
      return r ? localized(r.name as LocalizedText | null) : null;
    }
    case "process_step": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.processStepCatalog.findUnique({
        where: { id: n },
        select: { name: true, code: true },
      });
      return r ? nameCode(r.name, r.code) : null;
    }
    case "plant": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.plant.findUnique({
        where: { id: n },
        select: { name: true, code: true },
      });
      return r ? nameCode(r.name, r.code) : null;
    }
    case "storage_location": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.storageLocation.findUnique({
        where: { id: n },
        select: { name: true, code: true },
      });
      return r ? nameCode(r.name, r.code) : null;
    }
    case "work_location": {
      const n = intId(id);
      if (n == null) return null;
      const r = await prisma.workLocation.findUnique({
        where: { id: n },
        select: { name: true, code: true },
      });
      return r ? nameCode(r.name, r.code) : null;
    }
    default:
      return null;
  }
}

type LookupValue = { id: string; label: string };

function asLookupValue(v: unknown): LookupValue | null {
  if (typeof v !== "object" || v == null || Array.isArray(v)) return null;
  const id = (v as { id?: unknown }).id;
  return typeof id === "string" && id !== "" ? { id, label: "" } : null;
}

export type ApplyLookupLabelsResult =
  | { ok: true; answers: Record<string, FormAnswerValue> }
  | { ok: false; error: string };

/**
 * 回答中の lookup 値（トップレベル + サブテーブルの列）を突き合わせ、ラベルを
 * マスタの値で上書きした回答を返す。存在しない id が 1 つでもあれば、その項目の
 * ラベルを添えたエラーで止める（検証と同じく最初の 1 件だけ返す）。
 *
 * 型の検証は済んでいる前提（validateAnswers の後で呼ぶ）— ここは形が合っている
 * 値だけを見て、それ以外は触らない。
 */
export async function applyLookupLabels(
  fields: readonly FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
  tr: Tr,
): Promise<ApplyLookupLabelsResult> {
  const out: Record<string, FormAnswerValue> = { ...answers };
  const notFound = (field: FormFieldDef) => ({
    ok: false as const,
    error: tr("general.formsActions.lookupValueNotFound", {
      label: field.label.ja || field.key,
    }),
  });
  const resolveOne = async (
    field: FormFieldDef,
    raw: unknown,
  ): Promise<LookupValue | null | "missing"> => {
    const v = asLookupValue(raw);
    if (!v || !field.lookup) return null;
    const label = await resolveLookupLabel(field.lookup.source, v.id);
    return label == null ? "missing" : { id: v.id, label };
  };

  for (const field of fields) {
    if (field.type === "lookup") {
      const r = await resolveOne(field, out[field.key]);
      if (r === "missing") return notFound(field);
      if (r) out[field.key] = r;
      continue;
    }
    if (field.type === "table" && Array.isArray(out[field.key])) {
      const rows = out[field.key] as Record<string, unknown>[];
      const nextRows: Record<string, unknown>[] = [];
      for (const row of rows) {
        if (typeof row !== "object" || row == null) {
          nextRows.push(row);
          continue;
        }
        const nextRow = { ...row };
        for (const col of field.columns ?? []) {
          if (col.type !== "lookup") continue;
          const r = await resolveOne(col, nextRow[col.key]);
          if (r === "missing") return notFound(col);
          if (r) nextRow[col.key] = r;
        }
        nextRows.push(nextRow);
      }
      out[field.key] = nextRows as FormAnswerValue;
    }
  }
  return { ok: true, answers: out };
}
