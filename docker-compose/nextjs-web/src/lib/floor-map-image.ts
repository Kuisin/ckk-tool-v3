import "server-only";

/**
 * フロアマップの図面画像の保存（SY09 端末管理 / 拠点マスタ 共通）。
 *
 * **Server Action ではなく Route Handler（/api/floor-maps/[mapId]/image）から
 * 呼ぶ**こと。Server Action のリクエストボディは既定 1MB 上限で、図面（〜10MB）
 * は自分のコードに届く前に 413 で落ちる — プロフィール写真・添付・SY06
 * アップロードと同じ理由・同じ方式に揃えている。
 *
 * 保存先は SeaweedFS `kiosk/floor-maps/{系統的リネーム}` + files 行
 * （lib/attachments.ts の保存フローと同じ規約）。旧画像は best-effort で削除。
 */

import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { systematicFileName } from "@/lib/file-naming";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 図面画像の最大サイズ（10MB）。 */
export const MAX_MAP_IMAGE_BYTES = 10 * 1024 * 1024;

/** 拡張子 → 許可する MIME。拡張子と中身の型が食い違うものは受け付けない。 */
const MAP_IMAGE_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
};

/** フロアマップは kiosk 権限（無ければ master 権限）で編集できる。 */
export async function checkFloorMapPermission(
  action: "CREATE" | "UPDATE" | "DELETE",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const kiosk = await checkPermission("kiosk", action);
  if (kiosk.ok) return kiosk;
  return checkPermission("master", action);
}

/** 図面画像を差し替える。RBAC・検証・保存・監査までを一貫して行う。 */
export async function saveFloorMapImage(
  mapId: string,
  file: File,
): Promise<ActionResult> {
  const authz = await checkFloorMapPermission("UPDATE");
  if (!authz.ok) return actionError(authz.error);

  if (file.size <= 0) return actionError("画像ファイルを選択してください");
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    return actionError("画像サイズは 10MB 以下にしてください");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = MAP_IMAGE_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return actionError("対応していない画像形式です（PNG / JPG / WEBP / SVG）");
  }

  try {
    const map = await prisma.kioskFloorMap.findUnique({
      where: { id: mapId },
      include: { file: { select: { id: true, storageKey: true } } },
    });
    if (!map || !map.isActive) {
      return actionError("対象のフロアマップが見つかりません");
    }

    const bytes = await file.arrayBuffer();
    const storageKey = `kiosk/floor-maps/${systematicFileName(file.name)}`;
    if (!(await putObject(storageKey, bytes, allowed[0]))) {
      return actionError("ストレージへの保存に失敗しました");
    }

    const actor = await getCurrentActorId();
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: file.name,
            mimeType: allowed[0],
            sizeBytes: BigInt(bytes.byteLength),
            uploadedBy: actor,
          },
          select: { id: true },
        });
        await tx.kioskFloorMap.update({
          where: { id: mapId },
          data: { fileId: created.id },
        });
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    // 旧画像は best-effort で削除（他参照が残る場合は温存）。
    if (map.file) {
      const fileDeleted = await prisma.file
        .delete({ where: { id: map.file.id } })
        .then(() => true)
        .catch(() => false);
      if (fileDeleted) await deleteObject(map.file.storageKey);
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_floor_maps",
      recordId: mapId,
      after: { note: `図面画像を更新: ${file.name}` },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "図面画像の更新に失敗しました"));
  }
}
