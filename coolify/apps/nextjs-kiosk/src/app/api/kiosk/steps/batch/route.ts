/**
 * POST /api/kiosk/steps/batch — 工程の一括操作（開始 / 一時停止 / 完了）。
 *
 * **単一操作のルート（/api/kiosk/steps/[stepId]）を広げずに兄弟として足した。**
 * あちらはパスパラメータが identity で、canOperateStep はリクエスト全体を 403 に
 * するし、作業場所ゲートも 1 本の応答で打ち切る。stepIds[] を body に足すと
 * パスパラメータが無意味になり、これらのゲートの意味（403 → 行ごとの結果）が
 * 変わる = 単一工程の契約が黙って変わってしまう。
 *
 * 門は単一操作と同じ 4 段で、すべて fail-closed:
 *   1. セッション
 *   2. zod（件数の上限・重複なし）
 *   3. RBAC: work_order:UPDATE — **これはバッチ全体で 403**（権限は人に付くもの）
 *   4. 行レベルの割り当て — **こちらは工程ごとの結果**（NOT_ASSIGNED）。
 *      これが単一操作との唯一の意図的な差。
 *
 * 業務エラーは HTTP 200 + { ok:false, codes }（通信エラーと区別するため）。
 * **バッチは 1 つの原子的な単位ではなく N 個の独立操作** — 部分失敗が普通の状態
 * （前工程待ち・他端末に取られた・検査表未記入）で、全か無かにすると機能が死ぬ。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runWithActor } from "@/lib/audit";
import { hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/kiosk-auth";
import {
  type BatchOutcome,
  completeStepsBatch,
  pauseStepsBatch,
  startStepsBatch,
} from "@/lib/step-batch";
import {
  allowedWorkLocationIdsForStep,
  resolveWorkLocationByCode,
} from "@/lib/step-execution";

/**
 * 1 回で扱う工程の上限。既存ルートの上限（defectReasons 100 / items 200）に
 * ならう。工程ごとのゲートは件数に比例して増えるので、青天井にはしない。
 */
const MAX_STEPS = 20;

const bodySchema = z.object({
  action: z.enum(["START", "PAUSE", "COMPLETE"]),
  stepIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_STEPS)
    // 同じ工程を 2 回送られると結果の対応が崩れる
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "duplicate stepId",
    }),
  /** 開始時に実績へ記録する作業場所（読み取った QR）。バッチ全体で 1 つ。 */
  workLocationCode: z.string().trim().min(1).max(100).optional(),
  /**
   * 工程 id → ロット/伝票コード（START のみ）。**工程ごとに違う値**なので
   * バッチ全体で 1 つにはできない。欄を持つのは工程まとめ画面だけで、
   * 一覧からの一括開始では渡ってこない（ロット必須の工程は LOT_REQUIRED）。
   */
  lotTexts: z.record(z.string().uuid(), z.string().trim().max(200)).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { action, stepIds, workLocationCode, lotTexts } = parsed.data;

  // 権限は人に付くものなので、ここはバッチ全体で落とす（単一操作と同じ意味）
  if (!(await hasPermission(session.userId, "work_order", "UPDATE"))) {
    return NextResponse.json(
      { ok: false, codes: ["NO_PERMISSION"] },
      { status: 403 },
    );
  }

  const actor = session.userId;
  const device = session.deviceId;

  // ── 作業場所の解決（開始のみ・実績への記録用）。
  // 規則は単一操作と同じ: 読み取った QR の場所 ＞ 端末の既定。工程マスタに
  // 許可作業場所がある工程では許可外を記録せず、端末の「作業場所の制限」が
  // ON なら開始そのものを拒否する。**工程ごとに許可が違う**ので、ここでは
  // 工程ごとに解決して startStepsBatch へ渡す。
  const startItems: {
    stepId: string;
    workLocationId: number | null;
    lotText: string | null;
  }[] = [];
  const preRejected: BatchOutcome["results"] = [];

  if (action === "START") {
    const [steps, deviceRow, scanned] = await Promise.all([
      prisma.workOrderStep.findMany({
        where: { id: { in: stepIds } },
        select: { id: true, processStepId: true },
      }),
      prisma.kioskDevice.findUnique({
        where: { id: device },
        select: { defaultWorkLocationId: true, enforceWorkLocation: true },
      }),
      workLocationCode != null
        ? resolveWorkLocationByCode(workLocationCode)
        : Promise.resolve(null),
    ]);

    if (workLocationCode != null && scanned == null) {
      // 読み取った場所が無効ならバッチ全体を止める（1 つの QR に対する 1 つの答え）
      return NextResponse.json({
        ok: false,
        summary: { succeeded: 0, failed: stepIds.length },
        results: stepIds.map((stepId) => ({
          stepId,
          ok: false,
          codes: ["LOCATION_NOT_FOUND"],
        })),
      } satisfies BatchOutcome);
    }

    const byId = new Map(steps.map((s) => [s.id, s]));
    // 許可作業場所は工程マスタ単位なので、同じ工程が並ぶ一括では 1 回引けば足りる
    const allowedCache = new Map<number, Set<number> | null>();
    const deviceDefault = deviceRow?.defaultWorkLocationId ?? null;

    for (const stepId of stepIds) {
      const step = byId.get(stepId);
      if (!step) {
        preRejected.push({ stepId, ok: false, codes: ["NOT_FOUND"] });
        continue;
      }
      let allowed = allowedCache.get(step.processStepId);
      if (allowed === undefined) {
        allowed = await allowedWorkLocationIdsForStep(step.processStepId);
        allowedCache.set(step.processStepId, allowed);
      }

      if (scanned != null) {
        if (allowed != null && !allowed.has(scanned.id)) {
          preRejected.push({
            stepId,
            ok: false,
            codes: ["LOCATION_NOT_ALLOWED"],
          });
          continue;
        }
        startItems.push({
          lotText: lotTexts?.[stepId] ?? null,
          stepId,
          workLocationId: scanned.id,
        });
        continue;
      }

      const deviceAllowed =
        allowed == null ||
        (deviceDefault != null && allowed.has(deviceDefault));
      if (deviceRow?.enforceWorkLocation && !deviceAllowed) {
        preRejected.push({
          stepId,
          ok: false,
          codes: ["DEVICE_LOCATION_BLOCKED"],
        });
        continue;
      }
      // 許可外の既定は記録しない（制限トグル OFF でも工程マスタの制限は守る）
      startItems.push({
        lotText: lotTexts?.[stepId] ?? null,
        stepId,
        workLocationId: deviceAllowed ? deviceDefault : null,
      });
    }
  }

  // audit_logs / inventory_transactions の created_by をこの actor に束ねる。
  // バッチ全体を 1 つで包むので、どの工程の変更にも端末 id が付く。
  const outcome: BatchOutcome = await runWithActor(
    actor,
    async () => {
      switch (action) {
        case "START":
          return startStepsBatch(startItems, actor);
        case "PAUSE":
          return pauseStepsBatch(stepIds, actor);
        case "COMPLETE":
          return completeStepsBatch(stepIds, actor);
      }
    },
    device,
  );

  // 作業場所のゲートで先に落ちた分を混ぜて返す
  const results = [...preRejected, ...outcome.results];
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: failed === 0,
    summary: { succeeded: results.length - failed, failed },
    results,
  } satisfies BatchOutcome);
}
