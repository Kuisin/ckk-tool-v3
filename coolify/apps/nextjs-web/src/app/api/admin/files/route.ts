/**
 * File API — SeaweedFS 上のファイル管理 (SY06)。
 *
 *   GET    /api/admin/files            → list objects（アクセス可能分のみ）
 *   POST   /api/admin/files            → upload (multipart: file[, prefix])
 *   DELETE /api/admin/files?key=<key>  → delete one object
 *
 * アクセスは lib/file-access.ts で判定:
 * system:ADMIN = 全フォルダ / フォルダ権限（file_folder_grants）= 付与分 /
 * アプリ生成ファイルは所有アプリの READ 権限でも閲覧可。
 * 書き込み（アップロード・削除）は ADMIN か can_write 付きフォルダ権限のみ。
 */

import { getTranslations } from "next-intl/server";
import {
  canWriteKey,
  filterReadableKeys,
  resolveFileAccess,
} from "@/lib/file-access";
import { systematicFileName } from "@/lib/file-naming";
import {
  deleteObject,
  listObjects,
  putObject,
  storageReachable,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Reject keys that could escape the intended object space. */
function safeKey(key: string): string | null {
  const k = key.replace(/^\/+/, "").trim();
  if (!k || k.includes("..") || k.includes("\0")) return null;
  return k;
}

export async function GET(): Promise<Response> {
  const access = await resolveFileAccess();
  if (!access) return new Response("Unauthorized", { status: 401 });
  const [files, ok] = await Promise.all([listObjects(""), storageReachable()]);
  return Response.json({
    storageOk: ok,
    files: filterReadableKeys(access, files),
    isAdmin: access.isAdmin,
    canWritePrefixes: access.isAdmin
      ? null // null = 全フォルダ書き込み可
      : access.grants.filter((g) => g.canWrite).map((g) => g.pathPrefix),
  });
}

export async function POST(request: Request): Promise<Response> {
  const access = await resolveFileAccess();
  if (!access) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  const rawPrefix = (form.get("prefix") as string | null)?.trim() || "uploads";
  const prefix = safeKey(rawPrefix.replace(/\/+$/, ""));
  if (prefix === null) {
    return Response.json({ error: "invalid prefix" }, { status: 400 });
  }
  if (!canWriteKey(access, `${prefix}/x`)) {
    const tr = await getTranslations();
    return Response.json(
      { error: tr("settings.filesActions.uploadPermissionDenied") },
      { status: 403 },
    );
  }

  // 系統的なリネーム（一意 + 判別可能）: {yyyymmdd-HHmmss}_{rand}_{元名}
  const key = `${prefix}/${systematicFileName(file.name || "upload.bin")}`;
  const bytes = await file.arrayBuffer();
  const ok = await putObject(
    key,
    bytes,
    file.type || "application/octet-stream",
  );
  if (!ok) {
    return Response.json({ error: "storage write failed" }, { status: 502 });
  }
  return Response.json({ ok: true, key });
}

export async function DELETE(request: Request): Promise<Response> {
  const access = await resolveFileAccess();
  if (!access) return new Response("Unauthorized", { status: 401 });
  const raw = new URL(request.url).searchParams.get("key");
  const key = raw ? safeKey(raw) : null;
  if (!key) {
    return Response.json({ error: "key is required" }, { status: 400 });
  }
  if (!canWriteKey(access, key)) {
    const tr = await getTranslations();
    return Response.json(
      { error: tr("settings.filesActions.deletePermissionDenied") },
      { status: 403 },
    );
  }
  const ok = await deleteObject(key);
  return Response.json({ ok });
}
