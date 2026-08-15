import "server-only";

/**
 * avatar.ts — プロフィール写真（app.users.avatar_file_id / _thumb_）の
 * 読み書き。server-only.
 *
 * 写真は **アプリ内でアップロード** する（AD の thumbnailPhoto は取得しない）。
 * 実体は SeaweedFS `avatars/{系統的リネーム}`、参照は app.files 行 —
 * lib/attachments.ts / フロアマップ画像と同じ保存フロー。
 *
 * **2 サイズを保存する**（表示側で縮小させない）:
 *   大 (AVATAR_FULL_PX)  … プロフィール・ホームのカード
 *   小 (AVATAR_THUMB_PX) … 一覧・ヘッダー・履歴タイムライン
 * どちらも正方形であることをサーバー側で検証する（表示は丸く抜くだけ）。
 * 切り抜きと縮小は ImageCropModal（canvas）が行い、ここは検証と保存に徹する。
 *
 * 配信は /api/avatars/[userId]（ログイン必須、`?size=sm` で小）。差し替えても
 * URL が変わらないので、キャッシュを効かせるためファイル ID を `?v=` に載せる。
 */

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { systematicFileName } from "@/lib/file-naming";
import { imageSize } from "@/lib/image-size";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 最大ファイルサイズ（5MB）。 */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * 許可する拡張子 → 許可する申告 MIME（先頭が保存用の正規 MIME）。
 * SVG は不可 — インライン配信するため、スクリプトを含み得る形式は受けない。
 */
const AVATAR_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
};

export const AVATAR_EXT_LABEL = "PNG / JPG / WEBP";

/** 大サイズの 1 辺 px（ImageCropModal の書き出し値）。 */
export const AVATAR_FULL_PX = 512;
/** 小サイズ（サムネイル）の 1 辺 px。 */
export const AVATAR_THUMB_PX = 96;
/** 保存を許す 1 辺の上限 px（大 / 小それぞれ。多少の余裕込み）。 */
export const MAX_AVATAR_PIXELS = 1024;
export const MAX_AVATAR_THUMB_PIXELS = 256;

/**
 * 写真の配信 URL（`?v=` はファイル ID — 差し替え時のキャッシュ破棄）。
 * 小サイズは `?size=sm`。
 */
export function avatarUrl(
  userId: string,
  fileId: string,
  size: "full" | "thumb" = "full",
): string {
  const suffix = size === "thumb" ? "&size=sm" : "";
  return `/api/avatars/${userId}?v=${fileId}${suffix}`;
}

/** 受け取った画像 1 枚の検証結果（バイト列 + 保存用 MIME）。 */
interface CheckedImage {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}

/**
 * 画像 1 枚を検証する — 形式（拡張子 × 申告 MIME）・容量・正方形・寸法上限。
 * 文字列を返したらエラー理由。
 */
async function checkImage(
  file: File,
  maxPixels: number,
  label: string,
): Promise<CheckedImage | string> {
  if (file.size <= 0) return "画像ファイルを選択してください";
  if (file.size > MAX_AVATAR_BYTES) {
    return "画像サイズは 5MB 以下にしてください";
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = AVATAR_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return `対応していない画像形式です（${AVATAR_EXT_LABEL}）`;
  }

  const bytes = await file.arrayBuffer();
  // 正方形で保存することを不変条件にする（表示側は丸く抜くだけでよい）。
  // クライアントの切り抜きを信用せず、ヘッダーの寸法で検証する。
  const size = imageSize(bytes);
  if (!size) return "画像として読み取れませんでした";
  if (size.width !== size.height) {
    return "画像は正方形に切り抜いてから保存してください";
  }
  if (size.width > maxPixels) {
    return `${label}は ${maxPixels}px 四方以下にしてください`;
  }
  return { bytes, contentType: allowed[0], filename: file.name };
}

/**
 * プロフィール写真を保存（差し替え）する。大・小の 2 枚を受け取り、両方を
 * 保存する（小は一覧・ヘッダー・履歴用）。旧写真は best-effort で削除。
 * 呼び出し側で本人確認（またはユーザー管理権限）を済ませておくこと。
 */
export async function saveAvatar(
  userId: string,
  file: File,
  thumbFile: File,
): Promise<ActionResult<{ fileId: string; thumbFileId: string }>> {
  const full = await checkImage(file, MAX_AVATAR_PIXELS, "画像");
  if (typeof full === "string") return actionError(full);
  const thumb = await checkImage(
    thumbFile,
    MAX_AVATAR_THUMB_PIXELS,
    "サムネイル",
  );
  if (typeof thumb === "string") return actionError(thumb);

  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatarFile: { select: { id: true, storageKey: true } },
        avatarThumbFile: { select: { id: true, storageKey: true } },
      },
    });
    if (!before) return actionError("ユーザーが見つかりません");

    const fullKey = `avatars/${systematicFileName(full.filename)}`;
    const thumbKey = `avatars/${systematicFileName(thumb.filename, "thumb")}`;
    const stored = await Promise.all([
      putObject(fullKey, full.bytes, full.contentType),
      putObject(thumbKey, thumb.bytes, thumb.contentType),
    ]);
    if (!stored.every(Boolean)) {
      // 片方だけ書けた場合も含めて掃除する。
      await Promise.all([deleteObject(fullKey), deleteObject(thumbKey)]);
      return actionError("ストレージへの保存に失敗しました");
    }

    let ids: { fileId: string; thumbFileId: string };
    try {
      ids = await prisma.$transaction(async (tx) => {
        const createdFull = await tx.file.create({
          data: {
            storageKey: fullKey,
            filename: full.filename,
            mimeType: full.contentType,
            sizeBytes: BigInt(full.bytes.byteLength),
            uploadedBy: userId,
          },
          select: { id: true },
        });
        const createdThumb = await tx.file.create({
          data: {
            storageKey: thumbKey,
            filename: thumb.filename,
            mimeType: thumb.contentType,
            sizeBytes: BigInt(thumb.bytes.byteLength),
            uploadedBy: userId,
          },
          select: { id: true },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            avatarFileId: createdFull.id,
            avatarThumbFileId: createdThumb.id,
          },
        });
        return { fileId: createdFull.id, thumbFileId: createdThumb.id };
      });
    } catch (e) {
      // DB 失敗時は孤児を掃除
      await Promise.all([deleteObject(fullKey), deleteObject(thumbKey)]);
      throw e;
    }

    await discardFile(before.avatarFile);
    await discardFile(before.avatarThumbFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: before.username,
      after: { note: `プロフィール写真を設定: ${full.filename}` },
    });
    return actionOk(ids);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "写真の保存に失敗しました"));
  }
}

/** プロフィール写真を削除する。 */
export async function removeAvatar(userId: string): Promise<ActionResult> {
  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatarFile: { select: { id: true, storageKey: true } },
        avatarThumbFile: { select: { id: true, storageKey: true } },
      },
    });
    if (!before) return actionError("ユーザーが見つかりません");
    if (!before.avatarFile && !before.avatarThumbFile) return actionOk();

    await prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: null, avatarThumbFileId: null },
    });
    await discardFile(before.avatarFile);
    await discardFile(before.avatarThumbFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: before.username,
      after: { note: "プロフィール写真を削除" },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "写真の削除に失敗しました"));
  }
}

/** 旧写真の files 行 + 実体を掃除（他参照が残るなら温存）。 */
async function discardFile(
  file: { id: string; storageKey: string } | null,
): Promise<void> {
  if (!file) return;
  const deleted = await prisma.file
    .delete({ where: { id: file.id } })
    .then(() => true)
    .catch(() => false);
  if (deleted) await deleteObject(file.storageKey);
}
