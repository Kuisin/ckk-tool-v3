/**
 * design-programs.ts — 加工プログラム（設計図の版ごと）の読み書き。server-only.
 *
 * - 版 (design_versions) に N 本。1 本が N 工程（工程マスタ）を受け持つ。
 * - 機械のマスタは無い — **作業場所 (work_locations, MS0D) が機械**。
 * - 書けるのは版が編集できるあいだ（下書き・差し戻し — isVersionEditable）。
 * - 工程実行画面が「この工程で使うプログラム」を引く口もここ
 *   （選び方・並べ方は lib/design-programs-core.ts — 共有端末と双子）。
 *
 * 保存は**版ぶんを丸ごと置き換える**（EditablePanel の 1 回の保存 = 1 回の
 * 置き換え）。1 本ずつの保存にすると、並べ替えと削除の途中状態が DB に残る。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { storeOne, type UploadedFile } from "@/lib/design-files";
import {
  type DesignVersionStatus,
  isVersionEditable,
} from "@/lib/design-files-core";
import {
  pickWorkOrderDesignVersion,
  programsForStep,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { type LocalizedText, localized } from "@/lib/format";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject } from "@/lib/storage";

/** 画面へ渡すプログラム 1 本。 */
export interface DesignProgramView {
  id: string;
  name: string;
  programNumber: string | null;
  fileId: string | null;
  filename: string | null;
  workLocationId: number | null;
  workLocationName: string | null;
  notes: string | null;
  sortOrder: number;
  processSteps: { id: number; name: string }[];
}

/** 工程実行画面の 1 本（版の情報と機械一致の印つき）。 */
export interface StepProgramView extends DesignProgramView {
  machineMatch: boolean;
}

/** 工程実行画面が受け取るまとめ。 */
export interface StepProgramsView {
  /** プログラムを引いた版（無ければ null — 図面が無い / 確定版が無い）。 */
  version: { id: string; version: number; itemId: number } | null;
  programs: StepProgramView[];
}

const PROGRAM_INCLUDE = {
  file: { select: { filename: true } },
  workLocation: { select: { name: true } },
  steps: {
    select: {
      processStepId: true,
      processStep: { select: { name: true, sortOrder: true } },
    },
  },
} as const;

type ProgramRow = {
  id: string;
  name: string;
  programNumber: string | null;
  fileId: string | null;
  workLocationId: number | null;
  notes: string | null;
  sortOrder: number;
  file: { filename: string } | null;
  workLocation: { name: unknown } | null;
  steps: {
    processStepId: number;
    processStep: { name: unknown; sortOrder: number };
  }[];
};

function toView(r: ProgramRow): DesignProgramView {
  return {
    id: r.id,
    name: r.name,
    programNumber: r.programNumber,
    fileId: r.fileId,
    filename: r.file?.filename ?? null,
    workLocationId: r.workLocationId,
    workLocationName: r.workLocation
      ? localized(r.workLocation.name as LocalizedText | null)
      : null,
    notes: r.notes,
    sortOrder: r.sortOrder,
    processSteps: [...r.steps]
      .sort((a, b) => a.processStep.sortOrder - b.processStep.sortOrder)
      .map((s) => ({
        id: s.processStepId,
        name: localized(s.processStep.name as LocalizedText | null),
      })),
  };
}

/** 版のプログラム（並び順）。失敗時は空（詳細画面を壊さない）。 */
export async function listDesignPrograms(
  versionId: string,
): Promise<DesignProgramView[]> {
  try {
    const rows = await prisma.designProgram.findMany({
      where: { designVersionId: versionId },
      include: PROGRAM_INCLUDE,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => toView(r as ProgramRow));
  } catch (e) {
    console.error("listDesignPrograms failed", e);
    return [];
  }
}

/** 保存の 1 行。`id` 無し = 新規。`fileField` = この行に上げたファイルのフォーム名。 */
export const programInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  programNumber: z.string().trim().max(100).nullish(),
  workLocationId: z.number().int().positive().nullish(),
  processStepIds: z.array(z.number().int().positive()).min(1).max(100),
  notes: z.string().trim().max(2000).nullish(),
  /** 既存ファイルを外す（新しいファイルを上げたときも元は外れる）。 */
  removeFile: z.boolean().optional(),
  fileField: z.string().max(40).nullish(),
});
export type ProgramInput = z.infer<typeof programInputSchema>;

export const programsPayloadSchema = z.array(programInputSchema).max(200);

/**
 * 版のプログラムを丸ごと置き換える（design_file:UPDATE は呼び出し側で確認済み）。
 *
 * - 版が編集できる状態でなければ拒否（確定・承認依頼中は動かさない）。
 * - 新しいファイルは先に storage へ置き、トランザクションが失敗したら片付ける。
 * - 外れた / 差し替えたファイルは、コミット後に storage と files 行から消す
 *   （プログラムのファイルは他から参照されない）。
 */
export async function saveDesignPrograms(
  versionId: string,
  rows: ProgramInput[],
  uploads: Record<string, UploadedFile>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const v = await prisma.designVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      itemId: true,
      version: true,
      status: true,
      programs: { select: { id: true, fileId: true } },
    },
  });
  if (!v) return actionError(tr("production.designFileActions.notFound"));
  if (!isVersionEditable(v.status as DesignVersionStatus)) {
    return actionError(tr("production.designFileActions.lockedConfirmed"));
  }

  // 参照先の実在確認（存在しない工程・作業場所で FK エラーを出さない）。
  const stepIds = [...new Set(rows.flatMap((r) => r.processStepIds))];
  const locIds = [
    ...new Set(
      rows.map((r) => r.workLocationId).filter((x): x is number => x != null),
    ),
  ];
  const [steps, locs] = await Promise.all([
    prisma.processStepCatalog.count({ where: { id: { in: stepIds } } }),
    prisma.workLocation.count({ where: { id: { in: locIds } } }),
  ]);
  if (steps !== stepIds.length || locs !== locIds.length) {
    return actionError(tr("production.designPrograms.invalidReference"));
  }
  const existing = new Map(v.programs.map((p) => [p.id, p]));
  for (const r of rows) {
    if (r.id && !existing.has(r.id)) {
      return actionError(tr("production.designFileActions.notFound"));
    }
  }

  // 新しいファイルを置く（1 枚でも失敗したら置いたものを片付けて諦める）。
  const stored: { field: string; fileId: string; storageKey: string }[] = [];
  const rollback = async () => {
    for (const s of stored) {
      await deleteObject(s.storageKey);
      await prisma.file.delete({ where: { id: s.fileId } }).catch(() => {});
    }
  };
  for (const r of rows) {
    const f = r.fileField ? uploads[r.fileField] : undefined;
    if (!r.fileField || !f) continue;
    const res = await storeOne(v.itemId, f, tr);
    if (!res.ok) {
      await rollback();
      return actionError(res.error);
    }
    stored.push({ field: r.fileField, ...res });
  }
  const storedBy = new Map(stored.map((s) => [s.field, s.fileId]));

  const keptIds = new Set(rows.map((r) => r.id).filter(Boolean));
  const dropFileIds: string[] = [];
  for (const p of v.programs) {
    if (!keptIds.has(p.id) && p.fileId) dropFileIds.push(p.fileId);
  }

  try {
    const actor = await getCurrentActorId();
    const ok = await prisma.$transaction(async (tx) => {
      const fresh = await tx.designVersion.findUnique({
        where: { id: v.id },
        select: { status: true },
      });
      if (!fresh || !isVersionEditable(fresh.status as DesignVersionStatus)) {
        return false;
      }
      await tx.designProgram.deleteMany({
        where: {
          designVersionId: v.id,
          id: { notIn: [...keptIds] as string[] },
        },
      });
      for (const [i, r] of rows.entries()) {
        const newFile = r.fileField ? storedBy.get(r.fileField) : undefined;
        const prevFile = r.id ? (existing.get(r.id)?.fileId ?? null) : null;
        const fileId = newFile ?? (r.removeFile ? null : prevFile);
        if (prevFile && prevFile !== fileId) dropFileIds.push(prevFile);
        const data = {
          name: r.name,
          programNumber: r.programNumber || null,
          workLocationId: r.workLocationId ?? null,
          notes: r.notes || null,
          sortOrder: i,
          fileId,
        };
        const id = r.id
          ? (
              await tx.designProgram.update({
                where: { id: r.id },
                data,
                select: { id: true },
              })
            ).id
          : (
              await tx.designProgram.create({
                data: { ...data, designVersionId: v.id, createdBy: actor },
                select: { id: true },
              })
            ).id;
        await tx.designProgramStep.deleteMany({ where: { programId: id } });
        await tx.designProgramStep.createMany({
          data: [...new Set(r.processStepIds)].map((processStepId) => ({
            programId: id,
            processStepId,
          })),
        });
      }
      return true;
    });
    if (!ok) {
      await rollback();
      return actionError(tr("production.designFileActions.lockedConfirmed"));
    }
  } catch (e) {
    await rollback();
    return actionError(prismaErrorMessage(e, tr("common.couldNotSave"), tr));
  }

  // 外れたファイルの片付け（best-effort — 失敗しても保存は成功している）。
  if (dropFileIds.length > 0) {
    const files = await prisma.file
      .findMany({
        where: { id: { in: dropFileIds } },
        select: { id: true, storageKey: true },
      })
      .catch(() => []);
    for (const f of files) {
      await prisma.file.delete({ where: { id: f.id } }).catch(() => {});
      await deleteObject(f.storageKey).catch(() => {});
    }
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "design_versions",
    recordId: v.id,
    after: {
      note: tr("production.designPrograms.savedAudit", {
        version: v.version,
        count: rows.length,
      }),
      programs: rows.map((r) => r.name),
    },
  });
  return actionOk();
}

/**
 * 工程実行画面: この工程で使う加工プログラム。
 *
 * 版の決め方（lib/design-programs-core pickWorkOrderDesignVersion）:
 *   指示書が図面をピン留めしていればその版、無ければ指示書の顧客の系列の
 *   確定済み最新 → 汎用の確定済み最新。
 * 機械の一致は、その工程の計画行と実績行の作業場所で見る。
 */
export async function fetchStepPrograms(
  stepId: string,
): Promise<StepProgramsView> {
  const empty: StepProgramsView = { version: null, programs: [] };
  try {
    const step = await prisma.workOrderStep.findUnique({
      where: { id: stepId },
      select: {
        processStepId: true,
        plans: { select: { workLocationId: true } },
        actuals: { select: { workLocationId: true } },
        workOrder: {
          select: {
            productItemId: true,
            designFile: { select: { designVersionId: true } },
            orderLineLinks: {
              select: {
                orderLine: {
                  select: { acceptance: { select: { customerBpId: true } } },
                },
              },
            },
          },
        },
      },
    });
    const wo = step?.workOrder;
    if (!step || !wo?.productItemId) return empty;
    const versions = await prisma.designVersion.findMany({
      where: { itemId: wo.productItemId },
      select: { id: true, customerBpId: true, version: true, status: true },
    });
    const picked = pickWorkOrderDesignVersion(versions, {
      pinnedVersionId: wo.designFile?.designVersionId ?? null,
      customerBpId: workOrderDesignCustomer(
        wo.orderLineLinks.map((l) => l.orderLine.acceptance.customerBpId),
      ),
    });
    if (!picked) return empty;
    const programs = await listDesignPrograms(picked.id);
    const chosen = programsForStep(
      programs.map((p) => ({
        ...p,
        processStepIds: p.processSteps.map((s) => s.id),
      })),
      step.processStepId,
      [
        ...step.plans.map((p) => p.workLocationId),
        ...step.actuals.map((a) => a.workLocationId),
      ],
    );
    return {
      version: {
        id: picked.id,
        version: picked.version,
        itemId: wo.productItemId,
      },
      programs: chosen.map(({ processStepIds: _ids, ...p }) => p),
    };
  } catch (e) {
    console.error("fetchStepPrograms failed", e);
    return empty;
  }
}
