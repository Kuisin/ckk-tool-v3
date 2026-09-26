/**
 * closing.ts — 締日処理のバッチコア（監査 P2-4）。server-only.
 *
 * UI の runClosing（権限チェック付き Server Action）と、instrumentation の
 * 日次スケジューラ（CLOSING_AUTORUN=1 のとき JST 06 時台に実行）の両方から
 * 使う。**指定日までに締日が到来し、まだ締めていない顧客すべて**を対象に
 * PENDING 行を作り（冪等 — 既処理はスキップ）、続けて締日を過ぎている行は
 * そのまま請求書（DRAFT）まで作る。1 顧客の失敗が他社を止めない —
 * 締日処理 (PENDING 行の作成) と請求書生成 (invoice-generation.ts) の
 * どちらも 1 件ずつ独立に処理する。
 *
 * 旧・月次実行（対象月を明示的に選ぶ）は「指定日までのすべて」に置き換わった
 * ので、月初 3 日だけ前月も見る特例（旧 autorunTargetMonths）は無くなった —
 * 走らせ忘れは翌日以降の実行が自然に拾う。
 */

import {
  type CustomerClosingCandidate,
  collectClosingCandidatesUpTo,
} from "@/app/(dashboard)/billing/closings/data";
import { closingDateReached } from "@/components/billing/closings/model";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { generateInvoiceForClosing } from "@/lib/invoice-generation";
import { PERIODIC_LOCKS, withAdvisoryLock } from "./advisory-lock";
import { recordAudit } from "./audit";
import { prisma } from "./db";

export interface ClosingBatchResult {
  created: number;
  updated: number;
  skipped: number;
  /** 生成できた請求書（作成した順）。画面が結果ポップアップで一覧するために顧客名・金額も持つ。 */
  invoices: {
    invoiceNumber: string;
    customerName: string;
    totalAmount: number;
  }[];
  /** 締日行は作れたが請求書は生成できなかったもの（締日前 等）。 */
  failures: { customerName: string; error: string }[];
}

async function upsertPendingClosing(
  c: CustomerClosingCandidate,
): Promise<{ id: string; created: boolean } | null> {
  const existing = await prisma.billingClosing.findFirst({
    where: {
      customerBpId: c.customerBpId,
      closingDate: c.closingDate,
      kind: "SCHEDULED",
    },
  });
  if (existing && existing.status !== "PENDING") {
    return null; // 処理済み（スキップ）
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
    return { id: existing.id, created: false };
  }
  const row = await prisma.billingClosing.create({
    data: {
      customerBpId: c.customerBpId,
      closingDate: c.closingDate,
      kind: "SCHEDULED",
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
  return { id: row.id, created: true };
}

/**
 * 指定日までに締日が到来し、まだ締めていない顧客すべての未請求出荷を集計し、
 * 締日が到来している行はそのまま請求書（DRAFT）まで作る。
 */
export async function runClosingBatch(
  targetDate: Date,
): Promise<ClosingBatchResult> {
  const candidates = await collectClosingCandidatesUpTo(targetDate);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const invoices: ClosingBatchResult["invoices"] = [];
  const failures: ClosingBatchResult["failures"] = [];
  const todayIso = isoDateJst(new Date());

  for (const c of candidates) {
    const result = await upsertPendingClosing(c);
    if (!result) {
      skipped += 1;
      continue;
    }
    if (result.created) created += 1;
    else updated += 1;

    // 締日を過ぎている行はそのまま請求書まで作る（§9 更新: 締め → 下書き
    // まで 1 回）。過ぎていない行（未来日の締日を先に PENDING 化した場合）は
    // ここでは生成しない — 翌日以降の実行が拾う。
    if (!closingDateReached(c.closingDate, todayIso)) continue;
    const generated = await generateInvoiceForClosing(result.id);
    if (generated.ok) {
      invoices.push({
        invoiceNumber: generated.data.invoiceNumber,
        customerName: c.customerName,
        totalAmount: generated.data.totalAmount,
      });
    } else {
      failures.push({ customerName: c.customerName, error: generated.error });
    }
  }
  return { created, updated, skipped, invoices, failures };
}

/**
 * 今日はもう走ったか。**プロセス内の覚えなので、これだけでは足りない** —
 * コンテナが 2 つあれば 2 回走る。跨プロセスの排他は下の advisory lock が持つ。
 * こちらは残してある（同じプロセス内で 10 分ごとの判定が二重に動くのを、
 * DB へ問い合わせずに弾けるため）。
 */
let lastAutorunDate: string | null = null;

/**
 * 日次オートラン判定 + 実行（instrumentation から毎時呼ばれる）。
 * JST 06 時台に 1 日 1 回、**今日までに締日が到来した全顧客**を実行。
 * CLOSING_AUTORUN=1 のときのみ。
 *
 * ★ **ローリングデプロイ中は新旧 2 つのコンテナが同時に走る。**
 * `lastAutorunDate` はプロセス内の変数なので、新しいコンテナには「今日はもう
 * 走った」が伝わらず、同じ締めが二重に作られる。跨プロセスの排他は
 * `withAdvisoryLock`（DB のアドバイザリロック）が持つ。
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
    await withAdvisoryLock(PERIODIC_LOCKS.closingAutorun, async () => {
      const targetDate = new Date(
        Date.UTC(
          Number(get("year")),
          Number(get("month")) - 1,
          Number(get("day")),
        ),
      );
      const result = await runClosingBatch(targetDate);
      console.log(
        `[closing] 日次オートラン ${today}: 作成 ${result.created} / 更新 ${result.updated} / スキップ ${result.skipped} / 請求書 ${result.invoices.length} / 失敗 ${result.failures.length}`, // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
      );
    });
  } catch (e) {
    console.error("[closing] 日次オートラン失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
}
