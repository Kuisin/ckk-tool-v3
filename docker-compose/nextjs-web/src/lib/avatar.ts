import "server-only";

/**
 * avatar.ts — プロフィール写真（app.users.avatar_file_id）の読み書き。server-only.
 *
 * 写真は **アプリ内でアップロード** する（AD の thumbnailPhoto は取得しない）。
 * 実体は SeaweedFS `avatars/{系統的リネーム}`、参照は app.files 行 —
 * lib/attachments.ts / フロアマップ画像と同じ保存フロー。
 *
 * 配信は /api/avatars/[userId]（ログイン必須）。差し替えても URL が変わらない
 * ので、キャッシュを効かせるためファイル ID を `?v=` に載せる。
 */

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { systematicFileName } from "@/lib/file-naming";
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

/** 写真の配信 URL（`?v=` はファイル ID — 差し替え時のキャッシュ破棄）。 */
export function avatarUrl(userId: string, fileId: string): string {
  return `/api/avatars/${userId}?v=${fileId}`;
}

/**
 * プロフィール写真を保存（差し替え）する。旧写真は best-effort で削除。
 * 呼び出し側で本人確認（またはユーザー管理権限）を済ませておくこと。
 */
export async function saveAvatar(
  userId: string,
  file: File,
): Promise<ActionResult<{ fileId: string }>> {
  if (file.size <= 0) return actionError("画像ファイルを選択してください");
  if (file.size > MAX_AVATAR_BYTES) {
    return actionError("画像サイズは 5MB 以下にしてください");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = AVATAR_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return actionError(`対応していない画像形式です（${AVATAR_EXT_LABEL}）`);
  }

  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatarFile: { select: { id: true, storageKey: true } },
      },
    });
    if (!before) return actionError("ユーザーが見つかりません");

    const bytes = await file.arrayBuffer();
    const storageKey = `avatars/${systematicFileName(file.name)}`;
    if (!(await putObject(storageKey, bytes, allowed[0]))) {
      return actionError("ストレージへの保存に失敗しました");
    }

    let fileId: string;
    try {
      fileId = await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: file.name,
            mimeType: allowed[0],
            sizeBytes: BigInt(bytes.byteLength),
            uploadedBy: userId,
          },
          select: { id: true },
        });
        await tx.user.update({
          where: { id: userId },
          data: { avatarFileId: created.id },
        });
        return created.id;
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    await discardFile(before.avatarFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: before.username,
      after: { note: `プロフィール写真を設定: ${file.name}` },
    });
    return actionOk({ fileId });
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
      },
    });
    if (!before) return actionError("ユーザーが見つかりません");
    if (!before.avatarFile) return actionOk();

    await prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: null },
    });
    await discardFile(before.avatarFile);
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
