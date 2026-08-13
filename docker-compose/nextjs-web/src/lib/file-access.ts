import "server-only";

/**
 * file-access.ts — ファイル（SeaweedFS キー空間）のアクセス制御。server-only.
 *
 * 判定は 3 系統の OR:
 * 1. system:ADMIN — 全フォルダの読み書き
 * 2. フォルダ権限（app.file_folder_grants）— path_prefix の前方一致で
 *    読み（+ can_write で書き/削除）を個人に付与
 * 3. 所有アプリの権限 — 生成ファイルはフォルダ → アプリ権限のマップで
 *    そのアプリの READ を持つユーザーに読みを許可（例: pdfs/quotes → quote）
 *
 * 「システムファイル」= アプリが生成するファイル（SYSTEM_PREFIXES 配下）。
 * SY06 の一覧はこの分類でトグル表示する。
 */

import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";

/** 生成ファイル（システムファイル）のフォルダ → 所有アプリ権限コード。 */
export const APP_PREFIX_PERMISSIONS: { prefix: string; code: string }[] = [
  { prefix: "pdfs/quotes", code: "quote" },
  { prefix: "pdfs/invoices", code: "invoice" },
  { prefix: "pdfs/delivery-notes", code: "delivery_note" },
  { prefix: "pdfs/kiosk-cards", code: "kiosk" },
  { prefix: "attachments/material_purchase_orders", code: "purchase_order" },
  { prefix: "attachments/purchase_requests", code: "purchase_order" },
  { prefix: "attachments/material_receipts", code: "material_receipt" },
  { prefix: "attachments/order_acceptances", code: "order_acceptance" },
  { prefix: "attachments/work_orders", code: "work_order" },
  { prefix: "attachments/design_requests", code: "design_request" },
  { prefix: "kiosk", code: "kiosk" },
  { prefix: "intake", code: "order_acceptance" },
];

/** システムファイル（アプリ生成物）と見なすキー prefix。 */
export const SYSTEM_PREFIXES = ["pdfs", "kiosk", "intake"];

export function isSystemKey(key: string): boolean {
  return SYSTEM_PREFIXES.some(
    (p) => key === p || key.startsWith(`${p}/`),
  );
}

function keyInPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

export interface FileAccess {
  /** system:ADMIN（全フォルダ読み書き）。 */
  isAdmin: boolean;
  /** フォルダ権限（path_prefix → canWrite）。 */
  grants: { pathPrefix: string; canWrite: boolean }[];
  /** 所有アプリ権限で読める prefix。 */
  appReadPrefixes: string[];
}

/** 現在のユーザーのファイルアクセス情報を 1 回で解決する。 */
export async function resolveFileAccess(): Promise<FileAccess | null> {
  const admin = await checkPermission("system", "ADMIN");
  if (admin.ok) {
    return { isAdmin: true, grants: [], appReadPrefixes: [] };
  }
  // checkPermission は未ログインでもエラー文字列を返すだけなので、
  // ユーザー特定はフォルダ権限テーブル参照時のセッションで行う
  const { getCurrentActorId } = await import("@/lib/audit");
  const userId = await getCurrentActorId();
  if (!userId) return null;

  const [grants, appCodes] = await Promise.all([
    prisma.fileFolderGrant.findMany({
      where: { userId },
      select: { pathPrefix: true, canWrite: true },
    }),
    Promise.all(
      APP_PREFIX_PERMISSIONS.map(async (m) => ({
        prefix: m.prefix,
        ok: (await checkPermission(m.code, "READ")).ok,
      })),
    ),
  ]);
  return {
    isAdmin: false,
    grants,
    appReadPrefixes: appCodes.filter((a) => a.ok).map((a) => a.prefix),
  };
}

/** キーを読めるか。 */
export function canReadKey(access: FileAccess, key: string): boolean {
  if (access.isAdmin) return true;
  if (access.grants.some((g) => keyInPrefix(key, g.pathPrefix))) return true;
  return access.appReadPrefixes.some((p) => keyInPrefix(key, p));
}

/** キーへ書き込み（アップロード・削除）できるか。 */
export function canWriteKey(access: FileAccess, key: string): boolean {
  if (access.isAdmin) return true;
  return access.grants.some(
    (g) => g.canWrite && keyInPrefix(key, g.pathPrefix),
  );
}

/** アクセス可能なファイルだけに絞る（SY06 一覧用）。 */
export function filterReadableKeys<T extends { key: string }>(
  access: FileAccess,
  files: T[],
): T[] {
  if (access.isAdmin) return files;
  return files.filter((f) => canReadKey(access, f.key));
}
