/**
 * POST /api/kiosk/steps/[stepId] — 工程の開始・一時停止・再開・完了。
 *
 * キオスク内で完結する（nextjs-web の内部 API は叩かない）。
 * 門は 4 段で、すべて fail-closed:
 *   1. セッション（proxy は Cookie の有無しか見ないので必ず本検証する）
 *   2. RBAC: work_order:UPDATE（app.user_permissions ビュー）
 *   3. 行レベルの割り当て: 自分の計画がある or 自分がロック保持
 *   4. 業務ルール: step-execution.ts（依存・保存則・原子的クレーム）
 *
 * 業務エラーは HTTP 200 + { ok:false, codes } で返す（通信エラーと区別するため）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runWithActor } from "@/lib/audit";
import { hasPermission } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import {
  completeStepExecution,
  isAssignedToUser,
  pauseStepExecution,
  resumeStepExecution,
  type StepActionResult,
  startStepExecution,
} from "@/lib/step-execution";

const quantitiesSchema = z.object({
  inputQuantity: z.number().int().min(0),
  outputSuccessQuantity: z.number().int().min(0),
  outputDefectSemiFinished: z.number().int().min(0),
  outputDefectScrap: z.number().int().min(0),
  outputDefectRework: z.number().int().min(0),
});

const bodySchema = z.object({
  action: z.enum(["START", "PAUSE", "RESUME", "COMPLETE"]),
  /** START のみ: 作業者が実際に受け取った本数（未指定は想定受入数） */
  inputQuantity: z.number().int().min(0).nullable().optional(),
  /** COMPLETE のみ: NONE モードは null */
  quantities: quantitiesSchema.nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ stepId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { stepId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!(await hasPermission(session.userId, "work_order", "UPDATE"))) {
    return NextResponse.json(
      { ok: false, codes: ["NO_PERMISSION"] },
      { status: 403 },
    );
  }

  // 行レベル: 他人の工程は permission があっても操作させない
  if (!(await isAssignedToUser(stepId, session.userId))) {
    return NextResponse.json(
      { ok: false, codes: ["NOT_ASSIGNED"] },
      { status: 403 },
    );
  }

  const { action, inputQuantity, quantities } = parsed.data;
  const actor = session.userId;

  // audit_logs / inventory_transactions の created_by をこの actor に束ねる
  const result: StepActionResult = await runWithActor(actor, async () => {
    switch (action) {
      case "START":
        return startStepExecution(stepId, actor, inputQuantity ?? null);
      case "PAUSE":
        return pauseStepExecution(stepId, actor);
      case "RESUME":
        return resumeStepExecution(stepId, actor);
      case "COMPLETE":
        return completeStepExecution(stepId, actor, quantities ?? null);
    }
  });

  return NextResponse.json(result);
}
