/**
 * GET /api/avatars/[userId][?size=sm] — プロフィール写真の配信。
 *
 * app.users.avatar_file_id（`size=sm` なら avatar_thumb_file_id）→
 * files.storage_key を解決し、SeaweedFS（lib/storage）から本体をインライン
 * 返却する。サムネイルが無い古い写真は大サイズにフォールバックする。
 * 写真はヘッダー・ホーム・プロフィール等あらゆる画面に出るため、RBAC は
 * ログイン済みであることのみ（顔写真は社内公開情報）。未設定・未ログインは
 * 404 / 401。
 *
 * URL は差し替えでも変わらないので、呼び出し側が `?v=<fileId>` を付ける
 * （lib/avatar.ts の avatarUrl）— それ前提で長期キャッシュする。
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

export async function GET(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { userId } = await params;
  const url = new URL(request.url);
  const wantThumb = url.searchParams.get("size") === "sm";
  let file: { storageKey: string; mimeType: string } | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: decodeURIComponent(userId) },
      select: {
        avatarFile: { select: { storageKey: true, mimeType: true } },
        avatarThumbFile: { select: { storageKey: true, mimeType: true } },
      },
    });
    // サムネイル未生成（この機能より前に保存した写真）は大サイズで代用。
    file =
      (wantThumb ? user?.avatarThumbFile : user?.avatarFile) ??
      user?.avatarFile ??
      null;
  } catch {
    // 不正な uuid 等 — 404 扱い。
    file = null;
  }
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  // `?v=` 付き（= ファイル ID 固定）の URL のみ長期キャッシュ。
  const versioned = url.searchParams.has("v");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": file.mimeType || contentTypeForKey(file.storageKey),
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cache-control": versioned
        ? "private, max-age=86400, immutable"
        : "private, no-cache",
    },
  });
}
