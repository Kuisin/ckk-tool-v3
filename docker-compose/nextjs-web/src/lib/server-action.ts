/**
 * server-action.ts — Shared result type + Prisma error mapping for
 * Server Actions (master CRUD).
 *
 * Every action returns `ActionResult` so client components can branch on
 * `ok` and surface `error` via notifications (design.md §16.1).
 */

import type { LocalizedText } from "./format";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function actionOk(): ActionResult;
export function actionOk<T>(data: T): ActionResult<T>;
// biome-ignore lint/suspicious/noExplicitAny: overload implementation
export function actionOk(data?: any): any {
  return { ok: true, data };
}

export function actionError<T = undefined>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/** Prisma known error codes → user-facing Japanese message. */
export function prismaErrorMessage(e: unknown, fallback: string): string {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : undefined;
  switch (code) {
    case "P2002":
      return "同じコードのレコードが既に存在します";
    case "P2003":
      return "関連するデータが存在するため実行できません";
    case "P2025":
      return "対象のレコードが見つかりません";
    default:
      return fallback;
  }
}

/**
 * Build a `{ ja, en }` DB JSON value from form inputs.
 * DB multilingual fields must always carry both locales
 * (_specs/design.md §17.4) — an empty English value falls back to Japanese.
 */
export function localizedInput(ja: string, en?: string): LocalizedText {
  const j = ja.trim();
  const e = (en ?? "").trim();
  return { ja: j, en: e || j };
}

/** Same, but returns null when the Japanese value is empty (optional fields). */
export function localizedInputOrNull(
  ja?: string,
  en?: string,
): LocalizedText | null {
  if (!ja?.trim()) return null;
  return localizedInput(ja, en);
}
