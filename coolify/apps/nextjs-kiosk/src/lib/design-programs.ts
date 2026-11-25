/**
 * design-programs.ts — 工程実行画面の「この工程の加工プログラム」。
 *
 * 共有端末は DB を直接読む（Web の内部 API は叩かない — キオスクは自前で
 * 完結させる方針）。版の決め方・並べ方は twin file の
 * design-programs-core.ts が Web と共通で持ち、ここは DB から材料を集めるだけ。
 *
 * - **開始済みの工程は、開始したときに記録した版**（work_order_step_programs）
 *   を出す。未開始の工程はいまの現行版（廃止したものを除く）。
 * - 「この機種用」は、その工程の計画行・実績行の作業場所に加えて**この端末の
 *   既定の作業場所**の機種でも見る — 共有端末は機械の横に置かれていることが
 *   多く、「いまこの機械の前に立っている」が一番確かな手掛かりなので。
 * - 開始の記録（recordStepProgramsTx）も共有端末が自分で書く（書き込みの道は
 *   キオスクが持つ — Web の recordStepProgramsTx と同じ規則）。
 */

import { prisma } from "@/lib/db";
import {
  currentPrograms,
  pickWorkOrderDesignVersion,
  programsForStep,
  programsShownForStep,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Prisma } from "../../generated/client/client";

type Db = Prisma.TransactionClient | typeof prisma;

export interface KioskStepProgram {
  id: string;
  name: string;
  revision: number;
  programNumber: string | null;
  hasFile: boolean;
  filename: string | null;
  /** 対象の機種名（空 = 機種を問わない）。 */
  machineModelNames: string[];
  notes: string | null;
  modelMatch: boolean;
}

const PROGRAM_SELECT = {
  id: true,
  programKey: true,
  revision: true,
  name: true,
  programNumber: true,
  fileId: true,
  notes: true,
  sortOrder: true,
  supersededAt: true,
  retiredAt: true,
  file: { select: { filename: true } },
  machineModels: {
    select: { machineModel: { select: { id: true, name: true } } },
  },
  steps: { select: { processStepId: true } },
} as const satisfies Prisma.DesignProgramSelect;

type ProgramRow = Prisma.DesignProgramGetPayload<{
  select: typeof PROGRAM_SELECT;
}>;

const STEP_SELECT = {
  status: true,
  processStepId: true,
  plans: { select: { workLocation: { select: { machineModelId: true } } } },
  actuals: { select: { workLocation: { select: { machineModelId: true } } } },
  programUses: { select: { program: { select: PROGRAM_SELECT } } },
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
} as const satisfies Prisma.WorkOrderStepSelect;

type StepRow = Prisma.WorkOrderStepGetPayload<{ select: typeof STEP_SELECT }>;

const forCore = (r: ProgramRow) => ({
  ...r,
  machineModelIds: r.machineModels.map((m) => m.machineModel.id),
  processStepIds: r.steps.map((s) => s.processStepId),
});

/** 指示書が見る図面の版の全プログラム（全版）。 */
async function candidateRows(db: Db, step: StepRow): Promise<ProgramRow[]> {
  const wo = step.workOrder;
  if (!wo.productItemId) return [];
  const versions = await db.designVersion.findMany({
    where: { itemId: wo.productItemId },
    select: { id: true, customerBpId: true, version: true, status: true },
  });
  const picked = pickWorkOrderDesignVersion(versions, {
    pinnedVersionId: wo.designFile?.designVersionId ?? null,
    customerBpId: workOrderDesignCustomer(
      wo.orderLineLinks.map((l) => l.orderLine.acceptance.customerBpId),
    ),
  });
  if (!picked) return [];
  return db.designProgram.findMany({
    where: { designVersionId: picked.id },
    select: PROGRAM_SELECT,
  });
}

/** 工程の機械（計画・実績の作業場所 + 端末の既定）の機種。 */
async function modelIdsFor(
  db: Db,
  step: StepRow,
  deviceId: string | null,
): Promise<(number | null)[]> {
  const device = deviceId
    ? await db.kioskDevice.findUnique({
        where: { id: deviceId },
        select: {
          defaultWorkLocation: { select: { machineModelId: true } },
        },
      })
    : null;
  return [
    ...step.plans.map((p) => p.workLocation?.machineModelId ?? null),
    ...step.actuals.map((a) => a.workLocation?.machineModelId ?? null),
    device?.defaultWorkLocation?.machineModelId ?? null,
  ];
}

/** その工程で使う加工プログラム（無ければ空配列）。失敗時も空。 */
export async function getStepPrograms(
  stepId: string,
  deviceId: string | null,
  locale: Locale,
): Promise<KioskStepProgram[]> {
  try {
    const step = await prisma.workOrderStep.findUnique({
      where: { id: stepId },
      select: STEP_SELECT,
    });
    if (!step) return [];
    const [rows, models] = await Promise.all([
      candidateRows(prisma, step),
      modelIdsFor(prisma, step, deviceId),
    ]);
    const { programs } = programsShownForStep(
      {
        started: step.status !== "PENDING",
        recorded: step.programUses.map((u) => forCore(u.program)),
        candidates: rows.map(forCore),
      },
      step.processStepId,
      models,
    );
    return programs.map((p) => ({
      id: p.id,
      name: p.name,
      revision: p.revision,
      programNumber: p.programNumber,
      hasFile: p.fileId != null,
      filename: p.file?.filename ?? null,
      machineModelNames: p.machineModels.map((m) =>
        localized(m.machineModel.name as LocalizedText | null, locale),
      ),
      notes: p.notes,
      modelMatch: p.modelMatch,
    }));
  } catch (e) {
    console.error("getStepPrograms failed", e);
    return [];
  }
}

/**
 * 工程の開始で、いまこの工程に出ている版を記録する（開始と同じトランザクション
 * で呼ぶ）。記録した版は使用済みになり、Web 側でその場では書き換えられなくなる。
 */
export async function recordStepProgramsTx(
  tx: Prisma.TransactionClient,
  stepId: string,
  deviceId: string | null,
): Promise<number> {
  const step = await tx.workOrderStep.findUnique({
    where: { id: stepId },
    select: STEP_SELECT,
  });
  if (!step) return 0;
  const [rows, models] = await Promise.all([
    candidateRows(tx, step),
    modelIdsFor(tx, step, deviceId),
  ]);
  const chosen = programsForStep(
    currentPrograms(rows.map(forCore)),
    step.processStepId,
    models,
  );
  if (chosen.length === 0) return 0;
  const r = await tx.workOrderStepProgram.createMany({
    data: chosen.map((p) => ({ stepId, programId: p.id })),
    skipDuplicates: true,
  });
  return r.count;
}
