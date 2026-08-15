/**
 * GET /api/avatars/[userId] — プロフィール写真の配信。
 *
 * app.users.avatar_file_id → files.storage_key を解決し、SeaweedFS
 * （lib/storage）から本体をインライン返却する。写真はヘッダー・ホーム・
 * プロフィール等あらゆる画面に出るため、RBAC はログイン済みであること
 * のみ（役職写真は社内公開情報）。未設定・未ログインは 404 / 401。
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
  let file: { storageKey: string; mimeType: string } | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: decodeURIComponent(userId) },
      select: { avatarFile: { select: { storageKey: true, mimeType: true } } },
    });
    file = user?.avatarFile ?? null;
  } catch {
    // 不正な uuid 等 — 404 扱い。
    file = null;
  }
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  // `?v=` 付き（= ファイル ID 固定）の URL のみ長期キャッシュ。
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": file.mimeType || contentTypeForKey(file.storageKey),
      "content-disposition": "inline",
      "cache-control": versioned
        ? "private, max-age=86400, immutable"
        : "private, no-cache",
    },
  });
}
