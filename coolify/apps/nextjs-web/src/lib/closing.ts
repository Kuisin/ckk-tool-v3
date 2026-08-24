/**
 * closing.ts — 締日処理のバッチコア（監査 P2-4）。server-only.
 *
 * UI の runClosing（権限チェック付き Server Action）と、instrumentation の
 * 日次スケジューラ（CLOSING_AUTORUN=1 のとき JST 06 時台に当月分を実行）
 * の両方から使う。冪等 — 既処理（PENDING 以外）の締日はスキップ。
 */

import { collectClosingCandidates } from "@/app/(dashboard)/billing/closings/data";
import { recordAudit } from "./audit";
import { prisma } from "./db";

export interface ClosingBatchResult {
  created: number;
  updated: number;
  skipped: number;
}

/** 対象月 "YYYYMM" の未請求出荷を顧客×締日で集計（UI アクションと同一ロジック）。 */
export async function runClosingBatch(
  year: number,
  month: number,
): Promise<ClosingBatchResult> {
  const candidates = await collectClosingCandidates(year, month);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const existing = await prisma.billingClosing.findUnique({
      where: {
        customerBpId_closingDate: {
          customerBpId: c.customerBpId,
          closingDate: c.closingDate,
        },
      },
    });
    if (existing && existing.status !== "PENDING") {
      skipped += 1;
      continue;
    }
    if (existing) {
      await prisma.billingClosing.update({
        where: { id: existing.id },
        data: { totalAmount: c.totalAmount },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "billing_closings",
        recordId: existing.id,
        before: {
          totalAmount:
            existing.totalAmount != null ? Number(existing.totalAmount) : null,
        },
        after: {
          totalAmount: c.totalAmount,
          shipmentNumbers: c.shipmentNumbers,
        },
      });
      updated += 1;
    } else {
      const row = await prisma.billingClosing.create({
        data: {
          customerBpId: c.customerBpId,
          closingDate: c.closingDate,
          status: "PENDING",
          totalAmount: c.totalAmount,
        },
      });
      await recordAudit({
        action: "CREATE",
        tableName: "billing_closings",
        recordId: row.id,
        after: {
          customerBpId: c.customerBpId,
          closingDate: c.closingDate.toISOString().slice(0, 10),
          totalAmount: c.totalAmount,
          shipmentNumbers: c.shipmentNumbers,
        },
      });
      created += 1;
    }
  }
  return { created, updated, skipped };
}

let lastAutorunDate: string | null = null;

/**
 * 日次オートラン判定 + 実行（instrumentation から毎時呼ばれる）。
 * JST 06 時台に 1 日 1 回、当月分を実行。CLOSING_AUTORUN=1 のときのみ。
 */
export async function maybeRunDailyClosing(): Promise<void> {
  if (process.env.CLOSING_AUTORUN !== "1") return;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  if (get("hour") !== "06" || lastAutorunDate === today) return;
  lastAutorunDate = today;
  try {
    const result = await runClosingBatch(
      Number(get("year")),
      Number(get("month")),
    );
    console.log(
      `[closing] 日次オートラン ${today}: 作成 ${result.created} / 更新 ${result.updated} / スキップ ${result.skipped}`,
    );
  } catch (e) {
    console.error("[closing] 日次オートラン失敗:", e);
  }
}
