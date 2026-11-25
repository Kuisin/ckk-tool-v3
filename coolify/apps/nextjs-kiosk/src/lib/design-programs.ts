/**
 * design-programs.ts — 工程実行画面の「この工程の加工プログラム」（読むだけ）。
 *
 * 共有端末は DB を直接読む（Web の内部 API は叩かない — キオスクは自前で
 * 完結させる方針）。版の決め方・並べ方は twin file の
 * design-programs-core.ts が Web と共通で持ち、ここは DB から材料を集めるだけ。
 *
 * 機械の一致は、その工程の計画行・実績行の作業場所に加えて**この端末の既定の
 * 作業場所**でも見る — 共有端末は機械の横に置かれていることが多く、
 * 「いまこの機械の前に立っている」が一番確かな手掛かりなので。
 */

import { prisma } from "@/lib/db";
import {
  pickWorkOrderDesignVersion,
  programsForStep,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

export interface KioskStepProgram {
  id: string;
  name: string;
  programNumber: string | null;
  hasFile: boolean;
  filename: string | null;
  workLocationName: string | null;
  notes: string | null;
  machineMatch: boolean;
}

/** その工程で使う加工プログラム（無ければ空配列）。失敗時も空。 */
export async function getStepPrograms(
  stepId: string,
  deviceId: string | null,
  locale: Locale,
): Promise<KioskStepProgram[]> {
  try {
    const [step, device] = await Promise.all([
      prisma.workOrderStep.findUnique({
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
      }),
      deviceId
        ? prisma.kioskDevice.findUnique({
            where: { id: deviceId },
            select: { defaultWorkLocationId: true },
          })
        : null,
    ]);
    if (!step) return [];
    const wo = step.workOrder;
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
    if (!picked) return [];
    const rows = await prisma.designProgram.findMany({
      where: { designVersionId: picked.id },
      select: {
        id: true,
        name: true,
        programNumber: true,
        fileId: true,
        notes: true,
        sortOrder: true,
        workLocationId: true,
        file: { select: { filename: true } },
        workLocation: { select: { name: true } },
        steps: { select: { processStepId: true } },
      },
    });
    return programsForStep(
      rows.map((r) => ({
        ...r,
        processStepIds: r.steps.map((s) => s.processStepId),
      })),
      step.processStepId,
      [
        ...step.plans.map((p) => p.workLocationId),
        ...step.actuals.map((a) => a.workLocationId),
        device?.defaultWorkLocationId ?? null,
      ],
    ).map((p) => ({
      id: p.id,
      name: p.name,
      programNumber: p.programNumber,
      hasFile: p.fileId != null,
      filename: p.file?.filename ?? null,
      workLocationName: p.workLocation
        ? localized(p.workLocation.name as LocalizedText | null, locale)
        : null,
      notes: p.notes,
      machineMatch: p.machineMatch,
    }));
  } catch (e) {
    console.error("getStepPrograms failed", e);
    return [];
  }
}
