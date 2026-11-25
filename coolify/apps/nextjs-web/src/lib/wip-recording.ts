/**
 * wip-recording.ts — 工程完了のときに「仕掛品として在庫に置く分」を記録するための
 * 読み出しと検証（server-only）。
 *
 * 品物が工程を離れて在庫に入るとき（半製品の数を記録した / 「半製品在庫へ」で
 * 終わる分岐の終端）、記録する人は
 *   - 研削後の仕上がり寸法（径・長）
 *   - 手前に合流があれば、品物がどの経路を通ってきたか（推奨 = 本流）
 * を入れる。規則そのものは wip-state-core（純ロジック）にあり、ここは DB から
 * 材料を揃えて渡すだけ。
 *
 * **nextjs-web が原本で、nextjs-kiosk へ逐語コピーする twin file** — Web の
 * 工程完了（lib/workflow.ts）と共有端末の工程完了（lib/step-execution.ts）が
 * 同じ関数で同じ答えを出す。直したら `pnpm twin:sync`。
 */

import { prisma } from "./db";
import { workOrderWipBlankTx } from "./inventory";
import {
  storesWip,
  validateWipRecording,
  type WipRecordingInput,
  type WipRecordingIssue,
  type WipRecordingValue,
  type WipRecordingView,
  wipRecordingPath,
} from "./wip-state-core";
import {
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "./workflow-core";

/**
 * 工程 1 件の「在庫に置く分」の材料。再研磨の指示書は null（顧客の工具は
 * 自社の仕掛品にならない）。工程が無ければ null。
 */
export async function loadWipRecording(
  stepId: string,
): Promise<WipRecordingView | null> {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      processStepId: true,
      branchStockDisposition: true,
      workOrder: {
        select: {
          type: true,
          productItemId: true,
          materialItemId: true,
          steps: {
            select: {
              ...STEP_STATE_SELECT,
              processStep: { select: { affectsWipState: true, name: true } },
            },
          },
          stepLinks: { select: STEP_LINK_STATE_SELECT },
        },
      },
    },
  });
  if (!step || step.workOrder.type === "REGRIND") return null;
  const wo = step.workOrder;
  const affectsMap = new Map(
    wo.steps.map((s) => [s.processStepId, s.processStep.affectsWipState]),
  );
  const affects = (id: number) => affectsMap.get(id) ?? false;
  const path = wipRecordingPath(
    wo.steps.map(toStepState),
    wo.stepLinks,
    step.id,
    affects,
  );
  const blank = await workOrderWipBlankTx(prisma, wo);
  const stepNames: Record<number, unknown> = {};
  for (const s of wo.steps) stepNames[s.processStepId] = s.processStep.name;
  return {
    path,
    sourceAffects: affects(step.processStepId),
    sourceProcessStepId: step.processStepId,
    branchStock: step.branchStockDisposition,
    blank: blank
      ? { diameterMm: blank.size.diameterMm, lengthMm: blank.size.lengthMm }
      : null,
    stepNames,
  };
}

/**
 * 工程完了の入口の検証 — 完了させようとしている数量と入力から、工程に保存する
 * 値（仕上がり寸法・選んだ経路）を決める。在庫に置かない完了なら全部 null。
 */
export async function resolveWipRecording(
  stepId: string,
  quantities: { defectSemiFinished: number; outputSuccess: number },
  input: WipRecordingInput | null | undefined,
): Promise<{ issues: WipRecordingIssue[]; value: WipRecordingValue }> {
  const none: WipRecordingValue = {
    finishedDiameterMm: null,
    finishedLengthMm: null,
    pathStepIds: null,
  };
  const view = await loadWipRecording(stepId);
  if (!view) return { issues: [], value: none };
  const stores = storesWip({ ...quantities, branchStock: view.branchStock });
  if (!stores) return { issues: [], value: none };
  return validateWipRecording({
    stores,
    path: view.path,
    sourceCountsAsDone:
      view.sourceAffects &&
      view.branchStock === "SEMI_FINISHED" &&
      quantities.outputSuccess > 0,
    blank: view.blank,
    input,
  });
}
