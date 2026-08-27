/**
 * design-files.ts — 設計図の版（app.design_files）の読み書き。server-only.
 *
 * 版は **(製品 × 受注元)** ごとの連番で、1 版 =
 *   プレビュー 0..1 + 図面データ 1 + 参考資料 0..N
 * の 1 まとまり。判定規則そのものは lib/design-files-core.ts（純関数）が持ち、
 * ここは DB と storage をつなぐだけ。
 *
 * **版を作る口は 2 つある。** 設計依頼の完了（completeDesign）と、ここの
 * `createDesignVersion`（製品マスタから手で足す）。番号の採り方と is_latest の
 * 付け替えは**この 1 関数に集約**してあり、completeDesign も同じ関数を通る —
 * 2 箇所で数えると、片方だけ直したときに版が飛んだり is_latest が 2 行立ったり
 * するのが避けられない。
 */

import "server-only";

import { validateFile } from "@/lib/attachments";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  type DesignFileLike,
  type DesignFileRole,
  nextDesignVersion,
  sameSeries,
} from "@/lib/design-files-core";
import { systematicFileName } from "@/lib/file-naming";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 1 版に載せるファイル 1 枚（すでに files 行になっているもの）。 */
export interface VersionFileInput {
  fileId: string;
  role: DesignFileRole;
}

export interface CreateVersionInput {
  productId: number;
  /** null = 汎用。 */
  customerBpId: string | null;
  /** 設計依頼から作るときはその id。手動なら null。 */
  designRequestId: string | null;
  files: VersionFileInput[];
  notes?: string | null;
  actor: string | null;
}

/**
 * 版を 1 つ作る（採番 + is_latest の付け替え + 行作成）。
 *
 * **必ずトランザクションの中で呼ぶこと。** 採番は「読んで + 1 して書く」ので、
 * 同時に 2 つ走ると同じ番号が 2 回出る。呼び出し側の tx を受け取る形にして、
 * 版の作成が常に他の更新と同じトランザクションに入るようにしている。
 */
export async function createVersionInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: CreateVersionInput,
): Promise<number> {
  // 系列（製品 × 受注元）の中だけを見て次の番号を決める。
  const existing = await tx.designFile.findMany({
    where: { productId: input.productId },
    select: {
      id: true,
      version: true,
      isLatest: true,
      role: true,
      customerBpId: true,
      designRequestId: true,
    },
  });
  const version = nextDesignVersion(
    existing as DesignFileLike[],
    input.customerBpId,
  );

  // 同じ系列の is_latest だけを下ろす。**他の系列には触らない** —
  // 顧客 A の改訂で顧客 B の最新図面が消えては困る。
  const staleIds = existing
    .filter((f) => f.isLatest && sameSeries(f.customerBpId, input.customerBpId))
    .map((f) => f.id);
  if (staleIds.length > 0) {
    await tx.designFile.updateMany({
      where: { id: { in: staleIds } },
      data: { isLatest: false },
    });
  }

  await tx.designFile.createMany({
    data: input.files.map((f) => ({
      designRequestId: input.designRequestId,
      productId: input.productId,
      customerBpId: input.customerBpId,
      fileId: f.fileId,
      version,
      isLatest: true,
      role: f.role,
      notes: input.notes?.trim() || null,
      createdBy: input.actor,
    })),
  });
  return version;
}

/** アップロード 1 枚 → files 行。失敗したら storage も片付ける。 */
async function storeOne(
  productId: number,
  file: { name: string; type: string; bytes: ArrayBuffer },
): Promise<
  | { ok: true; fileId: string; storageKey: string }
  | { ok: false; error: string }
> {
  const checked = validateFile(file.name, file.type, file.bytes.byteLength);
  if (!checked.ok) return { ok: false, error: checked.error };
  const storageKey = `design-files/${productId}/${systematicFileName(
    file.name,
    `PRD-${productId}`,
  )}`;
  if (!(await putObject(storageKey, file.bytes, checked.contentType))) {
    return { ok: false, error: "ストレージへの保存に失敗しました" };
  }
  try {
    const actor = await getCurrentActorId();
    const row = await prisma.file.create({
      data: {
        storageKey,
        filename: file.name,
        mimeType: checked.contentType,
        sizeBytes: BigInt(file.bytes.byteLength),
        uploadedBy: actor,
      },
      select: { id: true },
    });
    return { ok: true, fileId: row.id, storageKey };
  } catch (e) {
    await deleteObject(storageKey);
    return { ok: false, error: prismaErrorMessage(e, "保存に失敗しました") };
  }
}

export interface UploadVersionInput {
  productId: number;
  customerBpId: string | null;
  notes: string | null;
  blueprint: { name: string; type: string; bytes: ArrayBuffer };
  preview?: { name: string; type: string; bytes: ArrayBuffer } | null;
  references?: { name: string; type: string; bytes: ArrayBuffer }[];
}

/**
 * 依頼を経ずに版を 1 つ足す（製品マスタから）。
 *
 * 図面だけ先に出来ている・既存図面を取り込む、といった場合に使う。
 * 出来た版は design_request_id = null なので、一覧では「手動」と出る。
 */
export async function uploadDesignVersion(
  input: UploadVersionInput,
): Promise<ActionResult<{ version: number }>> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });
  if (!product) return actionError("対象の製品が見つかりません");

  if (input.customerBpId) {
    const bp = await prisma.businessPartner.findUnique({
      where: { id: input.customerBpId },
      select: { id: true },
    });
    if (!bp) return actionError("対象の取引先が見つかりません");
  }

  // 先に全部を storage + files に置く。1 枚でも失敗したら、それまでに
  // 置いたものを消してから諦める（孤児を残さない）。
  const stored: { fileId: string; storageKey: string; role: DesignFileRole }[] =
    [];
  const rollback = async () => {
    for (const s of stored) {
      await deleteObject(s.storageKey);
      await prisma.file.delete({ where: { id: s.fileId } }).catch(() => {});
    }
  };

  const queue: {
    f: NonNullable<typeof input.preview>;
    role: DesignFileRole;
  }[] = [
    ...(input.preview
      ? [{ f: input.preview, role: "PREVIEW" as DesignFileRole }]
      : []),
    { f: input.blueprint, role: "BLUEPRINT" as DesignFileRole },
    ...(input.references ?? []).map((f) => ({
      f,
      role: "REFERENCE" as DesignFileRole,
    })),
  ];

  for (const item of queue) {
    const res = await storeOne(input.productId, item.f);
    if (!res.ok) {
      await rollback();
      return actionError(res.error);
    }
    stored.push({
      fileId: res.fileId,
      storageKey: res.storageKey,
      role: item.role,
    });
  }

  try {
    const actor = await getCurrentActorId();
    const version = await prisma.$transaction((tx) =>
      createVersionInTx(tx, {
        productId: input.productId,
        customerBpId: input.customerBpId,
        designRequestId: null,
        files: stored.map((s) => ({ fileId: s.fileId, role: s.role })),
        notes: input.notes,
        actor,
      }),
    );
    await recordAudit({
      action: "CREATE",
      tableName: "design_files",
      recordId: String(input.productId),
      after: {
        note: `設計図 v${version} を手動で登録（${stored.length} ファイル）`,
        productId: input.productId,
        customerBpId: input.customerBpId,
      },
    });
    return actionOk({ version });
  } catch (e) {
    await rollback();
    return actionError(prismaErrorMessage(e, "設計図の登録に失敗しました"));
  }
}
