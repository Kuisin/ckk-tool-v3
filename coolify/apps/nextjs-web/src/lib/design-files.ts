/**
 * design-files.ts — 設計図の版（app.design_versions + design_files）の書き込み。server-only.
 *
 * 版は **(製品 × 受注元)** ごとの連番で、1 版 =
 *   2D 原図 0..1 + 3D 原図 0..1 + プレビュー 0..1 + 参考資料 0..N + 仕様
 * の 1 まとまり（どれも任意 — 仕様だけの版もある）。判定規則そのものは
 * lib/design-files-core.ts（純関数）が持ち、ここは DB と storage をつなぐだけ。
 *
 * 版の一生は書類と同じ **下書き → (承認) → 確定**:
 *   - 作った時点で番号を採り、下書き（DRAFT）として置く。ファイルの is_latest は
 *     立てない — 指示書・製品マスタ・サムネイルが下書きの図面を拾わないように
 *   - 確定前は仕様もファイルも直せる
 *   - 確定で系列の is_latest がこの版へ移る（confirmVersionInTx が唯一の持ち主）
 *
 * **番号を採る口・is_latest を動かす口はこのファイルにしか無い。** 2 箇所で
 * 数えると、片方だけ直したときに版が飛んだり is_latest が 2 版に立ったりする。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { validateFile } from "@/lib/attachments";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DesignFileRole,
  type DesignVersionStatus,
  isVersionEditable,
  nextDesignVersion,
  sameSeries,
} from "@/lib/design-files-core";
import type { VersionSpecColumns } from "@/lib/design-spec";
import { systematicFileName } from "@/lib/file-naming";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** 1 版に載せるファイル 1 枚（すでに files 行になっているもの）。 */
export interface VersionFileInput {
  fileId: string;
  role: DesignFileRole;
  /** そのファイルだけの説明（参考資料の「何の図か」など）。 */
  notes?: string | null;
}

/** アップロードされた 1 枚。 */
export interface UploadedFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
  /** その 1 枚の説明（参考資料の何の図か）。 */
  note?: string | null;
}

/** 役割ごとのアップロード。原図・プレビューは各 1 枚まで、参考資料は何枚でも。 */
export interface VersionUploads {
  blueprint?: UploadedFile | null;
  model?: UploadedFile | null;
  preview?: UploadedFile | null;
  references?: UploadedFile[];
}

/** 版の採番で使う advisory lock の名前空間。他の用途と衝突しないための定数。 */
const VERSION_LOCK_NS = 0x0de5_1;

async function lockSeries(tx: Tx, itemId: number, customerBpId: string | null) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${VERSION_LOCK_NS}::int,
      hashtext(${`${itemId}:${customerBpId ?? ""}`})::int
    )`;
}

/** 同じ系列の確定前の版（あれば 1 つ）。 */
export async function findOpenVersion(
  client: Tx | typeof prisma,
  itemId: number,
  customerBpId: string | null,
): Promise<{ id: string; version: number } | null> {
  return client.designVersion.findFirst({
    where: { itemId, customerBpId, status: { not: "CONFIRMED" } },
    select: { id: true, version: true },
  });
}

/**
 * 下書きの版を 1 つ作る（採番 + 行作成）。**必ずトランザクションの中で呼ぶ。**
 *
 * ⚠️ トランザクションだけでは足りない。PostgreSQL の既定は READ COMMITTED
 * なので、同じ系列に同時に 2 本走ると両方が同じ max を読む。系列ごとの
 * advisory lock で直列化する（トランザクション終了時に自動で解放）。
 * 系列ごとに確定前の版は 1 つだけ（DB の部分 unique index が最後の砦）—
 * 既にあれば作らずに null を返し、呼び出し側がその版へ案内する。
 */
export async function createDraftVersionInTx(
  tx: Tx,
  input: {
    itemId: number;
    customerBpId: string | null;
    designRequestId: string | null;
    spec: VersionSpecColumns;
    actor: string | null;
  },
): Promise<
  | { ok: true; id: string; version: number }
  | { ok: false; openVersion: { id: string; version: number } }
> {
  await lockSeries(tx, input.itemId, input.customerBpId);
  const open = await findOpenVersion(tx, input.itemId, input.customerBpId);
  if (open) return { ok: false, openVersion: open };

  const existing = await tx.designVersion.findMany({
    where: { itemId: input.itemId },
    select: { customerBpId: true, version: true },
  });
  const version = nextDesignVersion(existing, input.customerBpId);
  const created = await tx.designVersion.create({
    data: {
      itemId: input.itemId,
      customerBpId: input.customerBpId,
      version,
      status: "DRAFT",
      designRequestId: input.designRequestId,
      notes: input.spec.notes,
      materialTypeId: input.spec.materialTypeId,
      diameterMm: input.spec.diameterMm,
      lengthMm: input.spec.lengthMm,
      spec: input.spec.spec ?? undefined,
      titleBlock: input.spec.titleBlock ?? undefined,
      history: [
        { action: "CREATE", user: input.actor, at: new Date().toISOString() },
      ] as Prisma.InputJsonValue,
      createdBy: input.actor,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id, version };
}

/** 版にファイルを載せる（下書きのファイルは is_latest を立てない）。 */
export async function attachFilesInTx(
  tx: Tx,
  version: {
    id: string;
    itemId: number;
    customerBpId: string | null;
    version: number;
    designRequestId: string | null;
    status: DesignVersionStatus;
  },
  files: VersionFileInput[],
  actor: string | null,
): Promise<void> {
  if (files.length === 0) return;
  await tx.designFile.createMany({
    data: files.map((f) => ({
      designVersionId: version.id,
      designRequestId: version.designRequestId,
      itemId: version.itemId,
      customerBpId: version.customerBpId,
      fileId: f.fileId,
      version: version.version,
      isLatest: version.status === "CONFIRMED",
      role: f.role,
      notes: f.notes?.trim() || null,
      createdBy: actor,
    })),
  });
}

/**
 * 版を確定する。系列の is_latest をこの版のファイルへ移す（他の系列には触らない
 * — 顧客 A の改訂で顧客 B の最新図面が消えては困る）。
 *
 * 条件付き更新で「確定前 → 確定」を 1 回だけ成立させる。同時に 2 人が押しても
 * 片方は count 0 で止まる。
 */
export async function confirmVersionInTx(
  tx: Tx,
  versionId: string,
  actor: string | null,
  history: Prisma.InputJsonValue,
): Promise<boolean> {
  const v = await tx.designVersion.findUnique({
    where: { id: versionId },
    select: { itemId: true, customerBpId: true },
  });
  if (!v) return false;
  await lockSeries(tx, v.itemId, v.customerBpId);
  const res = await tx.designVersion.updateMany({
    where: { id: versionId, status: { not: "CONFIRMED" } },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedBy: actor,
      history,
    },
  });
  if (res.count !== 1) return false;

  const seriesFiles = await tx.designFile.findMany({
    where: { itemId: v.itemId, isLatest: true },
    select: { id: true, customerBpId: true },
  });
  const stale = seriesFiles
    .filter((f) => sameSeries(f.customerBpId, v.customerBpId))
    .map((f) => f.id);
  if (stale.length > 0) {
    await tx.designFile.updateMany({
      where: { id: { in: stale } },
      data: { isLatest: false },
    });
  }
  await tx.designFile.updateMany({
    where: { designVersionId: versionId },
    data: { isLatest: true },
  });
  // 製品の仕様（外部 API・一覧が読む値）が変わりうるので、製品の更新日時を
  // 進める。/api/v1/products の差分同期は items.updated_at で拾う。
  await tx.item.update({
    where: { id: v.itemId },
    data: { updatedAt: new Date() },
  });
  return true;
}

/**
 * アップロード 1 枚 → files 行。失敗したら storage も片付ける。
 * ストレージキー・ファイル名の接頭辞は品目 id ベース。
 */
async function storeOne(
  itemId: number,
  file: UploadedFile,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<
  | { ok: true; fileId: string; storageKey: string }
  | { ok: false; error: string }
> {
  const checked = validateFile(file.name, file.type, file.bytes.byteLength, tr);
  if (!checked.ok) return { ok: false, error: checked.error };
  const storageKey = `design-files/${itemId}/${systematicFileName(
    file.name,
    `PRD-${itemId}`,
  )}`;
  if (!(await putObject(storageKey, file.bytes, checked.contentType))) {
    return { ok: false, error: tr("common.storageSaveFailed") };
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
    return {
      ok: false,
      error: prismaErrorMessage(e, tr("common.couldNotSave"), tr),
    };
  }
}

type Stored = {
  fileId: string;
  storageKey: string;
  role: DesignFileRole;
  note?: string | null;
};

/**
 * 全部を storage + files に置く。1 枚でも失敗したら、それまでに置いたものを
 * 消してから諦める（孤児を残さない）。
 */
async function storeUploads(
  itemId: number,
  uploads: VersionUploads,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<
  | { ok: true; stored: Stored[]; rollback: () => Promise<void> }
  | { ok: false; error: string }
> {
  const stored: Stored[] = [];
  const rollback = async () => {
    for (const s of stored) {
      await deleteObject(s.storageKey);
      await prisma.file.delete({ where: { id: s.fileId } }).catch(() => {});
    }
  };
  const queue: { f: UploadedFile; role: DesignFileRole }[] = [
    ...(uploads.preview
      ? [{ f: uploads.preview, role: "PREVIEW" as const }]
      : []),
    ...(uploads.blueprint
      ? [{ f: uploads.blueprint, role: "BLUEPRINT" as const }]
      : []),
    ...(uploads.model ? [{ f: uploads.model, role: "MODEL" as const }] : []),
    ...(uploads.references ?? []).map((f) => ({
      f,
      role: "REFERENCE" as const,
    })),
  ];
  for (const item of queue) {
    const res = await storeOne(itemId, item.f, tr);
    if (!res.ok) {
      await rollback();
      return { ok: false, error: res.error };
    }
    stored.push({
      fileId: res.fileId,
      storageKey: res.storageKey,
      role: item.role,
      note: item.f.note,
    });
  }
  return { ok: true, stored, rollback };
}

export interface CreateVersionInput {
  /** 対象製品（品目, items.id）。 */
  itemId: number;
  customerBpId: string | null;
  /** この版を成果物とする設計依頼 (SA06)。null = 依頼を経ない登録。 */
  designRequestId?: string | null;
  spec: VersionSpecColumns;
  uploads: VersionUploads;
}

/**
 * 版を 1 つ下書きで作る（設計図 PD16 の登録口）。
 *
 * designRequestId を渡せばその依頼の成果物として、渡さなければ手動登録
 * （図面だけ先に出来ている・既存図面を取り込む）として作る。
 */
export async function createDesignVersion(
  input: CreateVersionInput,
): Promise<
  ActionResult<{ versionId: string; version: number; itemId: number }>
> {
  const tr = await getTranslations();
  const productItem = await prisma.item.findUnique({
    where: { id: input.itemId, itemType: "PRODUCT" },
    select: { id: true },
  });
  if (!productItem) return actionError(tr("common.targetProductNotFound"));

  if (input.customerBpId) {
    const bp = await prisma.businessPartner.findUnique({
      where: { id: input.customerBpId },
      select: { id: true },
    });
    if (!bp) return actionError(tr("common.targetBusinessPartnerNotFound"));
  }

  // 依頼に紐づけるときは、**その依頼が同じ製品のものか**を確かめる。
  // 別製品の依頼に紐づくと、依頼側の「成果物」に無関係な図面が並び、
  // completeDesign の「成果物が 1 件以上ある」判定も通ってしまう。
  if (input.designRequestId) {
    const req = await prisma.designRequest.findUnique({
      where: { id: input.designRequestId },
      select: { id: true, itemId: true },
    });
    if (!req) return actionError(tr("common.targetDesignRequestNotFound"));
    if (req.itemId != null && req.itemId !== input.itemId) {
      return actionError(tr("common.designRequestProductMismatch"));
    }
  }

  // ファイルを置く前に、系列に確定前の版が無いかを確かめる（あるなら置いても
  // 捨てることになる）。最終判定はトランザクションの中でもう一度行う。
  const open = await findOpenVersion(prisma, input.itemId, input.customerBpId);
  if (open) {
    return actionError(
      tr("production.designFileActions.openVersionExists", {
        version: open.version,
      }),
    );
  }

  const stored = await storeUploads(input.itemId, input.uploads, tr);
  if (!stored.ok) return actionError(stored.error);

  try {
    const actor = await getCurrentActorId();
    const result = await prisma.$transaction(async (tx) => {
      const created = await createDraftVersionInTx(tx, {
        itemId: input.itemId,
        customerBpId: input.customerBpId,
        designRequestId: input.designRequestId ?? null,
        spec: input.spec,
        actor,
      });
      if (!created.ok) return created;
      await attachFilesInTx(
        tx,
        {
          id: created.id,
          itemId: input.itemId,
          customerBpId: input.customerBpId,
          version: created.version,
          designRequestId: input.designRequestId ?? null,
          status: "DRAFT",
        },
        stored.stored.map((s) => ({
          fileId: s.fileId,
          role: s.role,
          notes: s.note,
        })),
        actor,
      );
      return created;
    });
    if (!result.ok) {
      await stored.rollback();
      return actionError(
        tr("production.designFileActions.openVersionExists", {
          version: result.openVersion.version,
        }),
      );
    }
    await recordAudit({
      action: "CREATE",
      tableName: "design_versions",
      recordId: result.id,
      after: {
        note: tr(
          input.designRequestId
            ? "common.designFileRegisteredFromRequestNote"
            : "common.designFileRegisteredManuallyNote",
          { version: result.version, count: stored.stored.length },
        ),
        itemId: input.itemId,
        customerBpId: input.customerBpId,
        designRequestId: input.designRequestId ?? null,
        status: "DRAFT",
      },
    });
    return actionOk({
      versionId: result.id,
      version: result.version,
      itemId: input.itemId,
    });
  } catch (e) {
    await stored.rollback();
    return actionError(
      prismaErrorMessage(e, tr("common.designFileRegisterFailed"), tr),
    );
  }
}

/**
 * 確定前の版にファイルを足す（版の詳細の「ファイルを追加」）。原図・プレビューは
 * 各 1 枚まで — 既に同じ役割のファイルがあれば、先にそれを外してもらう
 * （黙って差し替えると、どちらが正の図面だったのかが履歴から消える）。
 */
export async function addDesignVersionFiles(
  versionId: string,
  uploads: VersionUploads,
): Promise<ActionResult<{ itemId: number }>> {
  const tr = await getTranslations();
  const v = await prisma.designVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      itemId: true,
      customerBpId: true,
      version: true,
      designRequestId: true,
      status: true,
      files: { select: { role: true } },
    },
  });
  if (!v) return actionError(tr("production.designFileActions.notFound"));
  if (!isVersionEditable(v.status)) {
    return actionError(tr("production.designFileActions.lockedConfirmed"));
  }
  const taken = new Set(v.files.map((f) => f.role));
  for (const [role, file] of [
    ["BLUEPRINT", uploads.blueprint],
    ["MODEL", uploads.model],
    ["PREVIEW", uploads.preview],
  ] as const) {
    if (file && taken.has(role)) {
      return actionError(
        tr("production.designFileActions.roleAlreadyAttached", {
          role: tr(`enum.DESIGN_FILE_ROLE_LABEL.${role}`),
        }),
      );
    }
  }

  const stored = await storeUploads(v.itemId, uploads, tr);
  if (!stored.ok) return actionError(stored.error);
  if (stored.stored.length === 0) return actionOk({ itemId: v.itemId });
  try {
    const actor = await getCurrentActorId();
    const attached = await prisma.$transaction(async (tx) => {
      // 置いているあいだに確定されていないか（確定後は足させない）。
      const fresh = await tx.designVersion.findUnique({
        where: { id: v.id },
        select: { status: true },
      });
      if (!fresh || !isVersionEditable(fresh.status)) return false;
      await attachFilesInTx(
        tx,
        { ...v, status: fresh.status },
        stored.stored.map((s) => ({
          fileId: s.fileId,
          role: s.role,
          notes: s.note,
        })),
        actor,
      );
      return true;
    });
    if (!attached) {
      await stored.rollback();
      return actionError(tr("production.designFileActions.lockedConfirmed"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: v.id,
      after: {
        note: tr("production.designFileActions.filesAddedAudit", {
          version: v.version,
          count: stored.stored.length,
        }),
      },
    });
    return actionOk({ itemId: v.itemId });
  } catch (e) {
    await stored.rollback();
    return actionError(
      prismaErrorMessage(e, tr("common.designFileRegisterFailed"), tr),
    );
  }
}
