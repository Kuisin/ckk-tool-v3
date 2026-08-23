/**
 * POST /api/kiosk/steps/[stepId] — 工程の開始・一時停止・再開・完了・
 * 検査記録・不良記録。
 *
 * キオスク内で完結する（nextjs-web の内部 API は叩かない）。
 * 門は 4 段で、すべて fail-closed:
 *   1. セッション（proxy は Cookie の有無しか見ないので必ず本検証する）
 *   2. RBAC: work_order:UPDATE（app.user_permissions ビュー）
 *   3. 行レベルの割り当て: 自分の計画がある / 自分がロック保持 / 未計画（開放）
 *   4. 業務ルール: step-execution.ts（依存・保存則・原子的クレーム）
 *
 * 業務エラーは HTTP 200 + { ok:false, codes } で返す（通信エラーと区別するため）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runWithActor } from "@/lib/audit";
import { hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/kiosk-auth";
import {
  canOperateStep,
  completeStepExecution,
  pauseStepExecution,
  resolveWorkLocationByCode,
  resumeStepExecution,
  type StepActionResult,
  setStepWorkLocation,
  startStepExecution,
} from "@/lib/step-execution";
import { recordDefects, recordInspection } from "@/lib/step-records";

const quantitiesSchema = z.object({
  inputQuantity: z.number().int().min(0),
  outputSuccessQuantity: z.number().int().min(0),
  outputDefectSemiFinished: z.number().int().min(0),
  outputDefectScrap: z.number().int().min(0),
  outputDefectRework: z.number().int().min(0),
});

const bodySchema = z.object({
  action: z.enum([
    "START",
    "PAUSE",
    "RESUME",
    "COMPLETE",
    "INSPECTION",
    "DEFECTS",
    "SET_LOCATION",
  ]),
  /** START のみ: 作業者が実際に受け取った本数（未指定は想定受入数） */
  inputQuantity: z.number().int().min(0).nullable().optional(),
  /**
   * START / SET_LOCATION: 作業場所 QR（CKK:LOC:<code>）の code。
   * START では端末の既定作業場所より優先。SET_LOCATION では必須。
   */
  workLocationCode: z.string().trim().min(1).max(100).optional(),
  /** COMPLETE のみ: NONE モードは null */
  quantities: quantitiesSchema.nullable().optional(),
  /** COMPLETE のみ: 不良の内訳（{種別, 理由, 数} のリスト）。 */
  defectReasons: z
    .array(
      z.object({
        type: z.enum(["SEMI", "SCRAP", "REWORK"]),
        reason: z.string().trim().max(100),
        count: z.number().int().min(1).max(1_000_000),
      }),
    )
    .max(100)
    .optional(),
  /** INSPECTION のみ — サンプル値: SELECT_MULTI は value[]、他は文字列 */
  templateId: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        templateItemId: z.number().int().positive(),
        values: z
          .array(
            z.union([
              z.string().max(200),
              z.array(z.string().max(200)).max(50),
            ]),
          )
          .max(1000),
        // 記録方式 COUNTS: 検査数・合格数（VALUES は null）
        inspectedCount: z.number().int().min(0).nullable(),
        passedCount: z.number().int().min(0).nullable(),
        isPass: z.boolean(),
      }),
    )
    .max(200)
    .optional(),
  /** DEFECTS のみ */
  defects: z
    .array(
      z.object({
        defectTypeId: z.number().int().positive(),
        description: z.string().trim().min(1).max(2000),
      }),
    )
    .max(50)
    .optional(),
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

  // 行レベル: 他人に計画された工程は permission があっても操作させない
  if (!(await canOperateStep(stepId, session.userId))) {
    return NextResponse.json(
      { ok: false, codes: ["NOT_ASSIGNED"] },
      { status: 403 },
    );
  }

  const {
    action,
    inputQuantity,
    workLocationCode,
    quantities,
    defectReasons,
    templateId,
    items,
    defects,
  } = parsed.data;
  const actor = session.userId;
  // 監査ログに「どの端末で」を残す（session.deviceId = この共有タブレット）。
  const device = session.deviceId;

  // 記録系はペイロード必須（zod は action 別の必須化をしないのでここで縛る）
  if (action === "INSPECTION") {
    if (templateId == null || items == null) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    const result = await runWithActor(
      actor,
      () => recordInspection(stepId, actor, templateId, items),
      device,
    );
    return NextResponse.json(result);
  }
  if (action === "DEFECTS") {
    if (defects == null) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    const result = await runWithActor(
      actor,
      () => recordDefects(stepId, actor, defects),
      device,
    );
    return NextResponse.json(result);
  }

  // 作業場所の解決（実績への記録用）:
  //   スキャンした QR の場所（workLocationCode）＞ 端末の既定作業場所。
  //   計画の作業場所は実績のソースにしない（端末既定のみ — 仕様）。
  let scannedLocationId: number | null = null;
  if (
    (action === "START" || action === "SET_LOCATION") &&
    workLocationCode != null
  ) {
    const resolved = await resolveWorkLocationByCode(workLocationCode);
    if (!resolved) {
      return NextResponse.json({
        ok: false,
        codes: ["LOCATION_NOT_FOUND"],
      } satisfies StepActionResult);
    }
    scannedLocationId = resolved.id;
  }
  if (action === "SET_LOCATION" && scannedLocationId == null) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  let deviceDefaultLocationId: number | null = null;
  if (action === "START" || action === "RESUME") {
    const deviceRow = await prisma.kioskDevice.findUnique({
      where: { id: device },
      select: { defaultWorkLocationId: true },
    });
    deviceDefaultLocationId = deviceRow?.defaultWorkLocationId ?? null;
  }

  // audit_logs / inventory_transactions の created_by をこの actor に束ねる
  const result: StepActionResult = await runWithActor(
    actor,
    async () => {
      switch (action) {
        case "START":
          return startStepExecution(
            stepId,
            actor,
            inputQuantity ?? null,
            scannedLocationId ?? deviceDefaultLocationId,
          );
        case "PAUSE":
          return pauseStepExecution(stepId, actor);
        case "RESUME":
          return resumeStepExecution(stepId, actor, deviceDefaultLocationId);
        case "COMPLETE":
          return completeStepExecution(
            stepId,
            actor,
            quantities ?? null,
            defectReasons ?? null,
          );
        case "SET_LOCATION":
          // scannedLocationId は上で必須検証済み
          return setStepWorkLocation(
            stepId,
            actor,
            scannedLocationId as number,
          );
      }
    },
    device,
  );

  return NextResponse.json(result);
}
