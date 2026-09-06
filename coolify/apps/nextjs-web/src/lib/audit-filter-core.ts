/**
 * audit-filter-core.ts — 操作履歴 (SY07) の URL クエリ → サーバー側の絞り込み値。
 *
 * `src/lib/login-history-filter-core.ts`（SY0D）と同じ理由・同じ形の姉妹
 * モジュール — あちらのヘッダ注記が言うとおり、**SY07 が「全件を持ってきて
 * クライアントで絞る」をやっていたのが直すべき側**だった。クエリ文字列は
 * 誰でも書き換えられるので、許可した値以外を Prisma の絞り込みへそのまま
 * 渡すと `PrismaClientValidationError` で画面ごと 500 になる — ここで
 * 許可リストと突き合わせて外れた値は null（絞り込みなし）に倒す。
 *
 * 純関数（DB・セッションに触れない）。RSC（クエリの発行元）とクライアント
 * （フィルタバーの選択肢）の**両方から**呼ぶので、許可リストが二重に
 * ならない。操作／対象の許可リストは `messages/ja.json` の
 * `audit.action` / `audit.table` から取る — 手書きの配列を別に持つと
 * 増やしたときに片方だけ直る。
 */

import { isUuid } from "./audit-record-key-core";
import { labelKeys } from "./messages";

/** サーバー側で並べ替えに対応する唯一の列。`created_at` にしか使える索引が無い。 */
export const AUDIT_SORT_KEY = "at";

export const AUDIT_PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_AUDIT_PAGE_SIZE = 20;

export interface AuditQuery {
  /** "YYYY-MM-DD"（表示タイムゾーンの暦日）。不正な形式・範囲外は null。 */
  from: string | null;
  to: string | null;
  userId: string | null;
  action: string | null;
  tableName: string | null;
  q: string | null;
  page: number;
  pageSize: number;
  sortDir: "asc" | "desc";
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string | null {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | null): string | null {
  return value && DATE_RE.test(value) ? value : null;
}

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parsePageSize(value: string | null): number {
  const n = Number(value);
  return (AUDIT_PAGE_SIZES as readonly number[]).includes(n)
    ? n
    : DEFAULT_AUDIT_PAGE_SIZE;
}

/** `"at.desc"` → dir だけ取り出す。key が `AUDIT_SORT_KEY` 以外は無視して既定へ。 */
function parseSortDir(value: string | null): "asc" | "desc" {
  if (!value) return "desc";
  const idx = value.lastIndexOf(".");
  const key = idx > 0 ? value.slice(0, idx) : value;
  const dir = value.slice(idx + 1);
  if (key !== AUDIT_SORT_KEY) return "desc";
  return dir === "asc" ? "asc" : "desc";
}

/**
 * `searchParams` → `AuditQuery`。全フィールドがクランプ済みなので、呼び出し側
 * （`queryAuditEntries`）は結果をそのまま Prisma の `where` へ渡してよい。
 */
export function parseAuditQuery(sp: SearchParams): AuditQuery {
  const actionAllowed = new Set(labelKeys("audit.action"));
  const tableAllowed = new Set(labelKeys("audit.table"));

  const action = one(sp, "action");
  const tableName = one(sp, "table");
  const userId = one(sp, "user");

  return {
    from: parseDate(one(sp, "from")),
    to: parseDate(one(sp, "to")),
    userId: userId && isUuid(userId) ? userId : null,
    action: action && actionAllowed.has(action) ? action : null,
    tableName: tableName && tableAllowed.has(tableName) ? tableName : null,
    q: one(sp, "q"),
    page: parsePage(one(sp, "page")),
    pageSize: parsePageSize(one(sp, "size")),
    sortDir: parseSortDir(one(sp, "sort")),
  };
}
