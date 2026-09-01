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

import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { avatarStorageKey } from "@/lib/file-naming";
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
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<CheckedImage | string> {
  if (file.size <= 0) return tr("common.selectAnImageFile");
  if (file.size > MAX_AVATAR_BYTES) {
    return tr("common.imageSizeMax5Mb");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = AVATAR_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return tr("common.unsupportedImageFormat", { formats: AVATAR_EXT_LABEL });
  }

  const bytes = await file.arrayBuffer();
  // 正方形で保存することを不変条件にする（表示側は丸く抜くだけでよい）。
  // クライアントの切り抜きを信用せず、ヘッダーの寸法で検証する。
  const size = imageSize(bytes);
  if (!size) return tr("common.couldNotReadAsImage");
  if (size.width !== size.height) {
    return tr("common.cropImageToSquareBeforeSaving");
  }
  if (size.width > maxPixels) {
    return tr("common.imageMustBeAtMostPixelsSquare", { label, maxPixels });
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
  const tr = await getTranslations();
  const full = await checkImage(
    file,
    MAX_AVATAR_PIXELS,
    tr("common.image"),
    tr,
  );
  if (typeof full === "string") return actionError(full);
  const thumb = await checkImage(
    thumbFile,
    MAX_AVATAR_THUMB_PIXELS,
    tr("common.thumbnail"),
    tr,
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
    if (!before) return actionError(tr("common.userNotFound"));

    // 同一リクエストの 2 枚は同じ timestamp を共有する（対で追いやすい）。
    const stamp = Date.now();
    const fullKey = avatarStorageKey(userId, "large", full.contentType, stamp);
    const thumbKey = avatarStorageKey(
      userId,
      "small",
      thumb.contentType,
      stamp,
    );
    const stored = await Promise.all([
      putObject(fullKey, full.bytes, full.contentType),
      putObject(thumbKey, thumb.bytes, thumb.contentType),
    ]);
    if (!stored.every(Boolean)) {
      // 片方だけ書けた場合も含めて掃除する。
      await Promise.all([deleteObject(fullKey), deleteObject(thumbKey)]);
      return actionError(tr("common.storageSaveFailed"));
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

    // 新旧が同じキー（同ミリ秒の差し替え）なら実体は消さない — 消すと
    // いま保存したばかりのオブジェクトが消えるため。
    const newKeys = new Set([fullKey, thumbKey]);
    await discardFile(before.avatarFile, newKeys);
    await discardFile(before.avatarThumbFile, newKeys);
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: before.username,
      after: {
        note: tr("common.profilePhotoSetNote", { name: full.filename }),
      },
    });
    return actionOk(ids);
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.photoSaveFailed"), tr));
  }
}

/** プロフィール写真を削除する。 */
export async function removeAvatar(userId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatarFile: { select: { id: true, storageKey: true } },
        avatarThumbFile: { select: { id: true, storageKey: true } },
      },
    });
    if (!before) return actionError(tr("common.userNotFound"));
    if (!before.avatarFile && !before.avatarThumbFile) return actionOk();

    await prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: null, avatarThumbFileId: null },
    });
    // 削除では実体も確実に消す。
    await discardFile(before.avatarFile);
    await discardFile(before.avatarThumbFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: before.username,
      after: { note: tr("common.profilePhotoDeletedNote") },
    });
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.photoDeleteFailed"), tr),
    );
  }
}

/**
 * 旧写真の files 行 + 実体を掃除（他参照が残るなら温存）。
 * `keepKeys` に含まれるキーは実体を消さない（新しい写真と同じキーのとき）。
 */
async function discardFile(
  file: { id: string; storageKey: string } | null,
  keepKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (!file) return;
  const deleted = await prisma.file
    .delete({ where: { id: file.id } })
    .then(() => true)
    .catch(() => false);
  if (deleted && !keepKeys.has(file.storageKey)) {
    await deleteObject(file.storageKey);
  }
}
