/**
 * Admin file API — manage documents stored on SeaweedFS (incoming uploads and
 * generated PDFs). Server-only; the filer is not published to the host, so the
 * browser reaches storage only through these proxied routes.
 *
 *   GET    /api/admin/files            → list objects (optional ?prefix=)
 *   POST   /api/admin/files            → upload (multipart: file[, prefix])
 *   DELETE /api/admin/files?key=<key>  → delete one object
 *
 * NOTE: access is not yet gated to admins — wire this to the RBAC check once
 * auth lands (see _specs RBAC / user_permissions).
 */

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

export async function GET(request: Request): Promise<Response> {
  const prefix = new URL(request.url).searchParams.get("prefix") ?? "";
  const clean = safeKey(prefix.endsWith("/") ? prefix : `${prefix}/`) ?? "";
  const [files, ok] = await Promise.all([
    listObjects(prefix ? clean.replace(/\/$/, "") : ""),
    storageReachable(),
  ]);
  return Response.json({ storageOk: ok, files });
}

export async function POST(request: Request): Promise<Response> {
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

  // Keep a safe, human-readable filename; prefix a timestamp to avoid clobbering.
  const base = (file.name || "upload.bin").replace(/[/\\]/g, "_");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  const key = `${prefix}/${stamp}_${base}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ok = await putObject(
    key,
    bytes,
    file.type || "application/octet-stream",
  );
  if (!ok) {
    return Response.json({ error: "storage write failed" }, { status: 502 });
  }
  return Response.json({ key });
}

export async function DELETE(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("key");
  const key = raw ? safeKey(raw) : null;
  if (!key) {
    return Response.json({ error: "valid key is required" }, { status: 400 });
  }
  const ok = await deleteObject(key);
  if (!ok) {
    return Response.json({ error: "delete failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
