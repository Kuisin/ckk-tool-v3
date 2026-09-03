/**
 * 本人のプロフィール写真の更新 API。
 *
 *   POST   /api/avatars  → 設定・差し替え（multipart: file）
 *   DELETE /api/avatars  → 削除
 *
 * どちらも **ログイン中の本人** に対してのみ働く（対象ユーザーは受け取らない）。
 * 検証・保存・監査は lib/avatar.ts。
 *
 * Server Action ではなく Route Handler なのは、Server Action のリクエスト
 * ボディが既定 1MB 上限で、写真（〜5MB）が 413 になるため
 * — 添付（/api/attachments/upload）・SY06 アップロードと同じ方式に揃える。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import {
  avatarUrl,
  MAX_AVATAR_BYTES,
  removeAvatar,
  saveAvatar,
} from "@/lib/avatar";

export const dynamic = "force-dynamic";

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/** ログイン中ユーザー ID（未ログインは null）。 */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const tr = await getTranslations();
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: tr("common.loginRequired") },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(tr("settings.avatarsRoute.sendAsMultipartFormData"));
  }

  // 大（詳細・ホーム用）と小（一覧・ヘッダー・履歴用）の 2 枚を受け取る。
  const file = form.get("file");
  const thumb = form.get("thumb");
  if (!(file instanceof File) || !(thumb instanceof File)) {
    return badRequest(tr("settings.avatarsRoute.selectAnImageFile"));
  }
  // 巨大ファイルはバッファリング前に弾く。
  if (file.size > MAX_AVATAR_BYTES || thumb.size > MAX_AVATAR_BYTES) {
    return badRequest(tr("settings.avatarsRoute.imageSizeMustBe5mb"));
  }

  const result = await saveAvatar(userId, file, thumb);
  if (!result.ok) return badRequest(result.error);

  revalidatePath("/", "layout"); // ヘッダー・ホームのアバターを更新
  return NextResponse.json({
    ok: true,
    avatarUrl: avatarUrl(userId, result.data.fileId),
    avatarThumbUrl: avatarUrl(userId, result.data.thumbFileId, "thumb"),
  });
}

export async function DELETE(): Promise<NextResponse> {
  const tr = await getTranslations();
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: tr("common.loginRequired") },
      { status: 401 },
    );
  }
  const result = await removeAvatar(userId);
  if (!result.ok) return badRequest(result.error);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
