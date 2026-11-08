"use server";

/**
 * Server Actions — 締日処理 (app.billing_closings, BL02).
 *
 * runClosing(dateIso): **指定日までに締日が到来し、まだ締めていない顧客
 * すべて**の未請求出荷（SHIPPED × DISPATCH）を集計し、PENDING の
 * billing_closings 行を作成/更新したうえで、締日を過ぎている行はそのまま
 * 請求書（DRAFT）まで作る（§9 更新: 締め → 下書きまで 1 回。バッチコアは
 * lib/closing.ts — 日次オートランと共通）。既に処理済み（PROCESSED/EXPORTED）
 * の行はスキップ。
 *
 * processClosing(id) / processClosings(ids): 締日前で自動生成できなかった行、
 * 生成に失敗した行を後から拾うための経路（実際の生成は lib/invoice-generation.ts
 * generateInvoiceForClosing と同じ関数を通る — 押した順で結果が変わらない）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  type ClosingSimulation,
  isRunnableClosingDate,
  parseClosingDate,
  summarizeClosingSimulation,
} from "@/components/billing/closings/model";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { generateInvoiceForClosing } from "@/lib/invoice-generation";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/billing/closings";

export interface RunClosingResult {
  created: number;
  updated: number;
  skipped: number;
  /** 生成できた請求書（作成した順）。結果ポップアップの一覧に使う。 */
  invoices: {
    invoiceNumber: string;
    customerName: string;
    totalAmount: number;
  }[];
  failures: { customerName: string; error: string }[];
}

/**
 * 締日処理を実行 — 指定日（既定は今日）までに締日が到来し、まだ締めていない
 * 顧客すべての未請求出荷を集計する。締日を過ぎている行はそのまま請求書
 * （下書き）まで作る。1 社の失敗は他社を止めない — 締日行の作成・請求書生成
 * のどちらも 1 件ずつ独立に処理する（lib/closing.ts runClosingBatch）。
 */
export async function runClosing(
  dateIso: string,
): Promise<ActionResult<RunClosingResult>> {
  const tr = await getTranslations();
  const targetDate = parseClosingDate(dateIso);
  if (!targetDate) return actionError(tr("billing.closingActions.invalidDate"));
  // 未来日では走らせない — 締日行だけ作られて請求書は作られない半端な状態が
  // 残るため（理由は model.ts isRunnableClosingDate）。見るだけなら試算へ。
  if (!isRunnableClosingDate(dateIso, isoDateJst(new Date()))) {
    return actionError(tr("billing.closingActions.futureDateNotRunnable"));
  }
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // バッチコアは lib/closing.ts（日次オートランと共通 — 監査 P2-4）
    const { runClosingBatch } = await import("@/lib/closing");
    const result = await runClosingBatch(targetDate);
    if (
      result.created +
        result.updated +
        result.skipped +
        result.invoices.length ===
      0
    ) {
      return actionError(
        tr("billing.closingActions.noUnbilledShipmentsUpToDate"),
      );
    }
    revalidatePath(BASE_PATH);
    revalidatePath("/billing/invoices");
    return actionOk(result);
  } catch (e) {
    const { prismaErrorMessage } = await import("@/lib/server-action");
    return actionError(
      prismaErrorMessage(e, tr("billing.closingActions.runFailed"), tr),
    );
  }
}

/**
 * 締日処理の**試算** — 指定日に実行したら何が作られるかを見るだけ。
 * DB には一切書かない（締日行も請求書も作らない・監査行も残さない）。
 *
 * 実行は今日までに制限しているので（isRunnableClosingDate）、「次の締日で
 * いくら請求されるのか」を先に見る手段がこれ以外に無い。**未来日を許すのは
 * ここだけ**。
 *
 * 候補集めは実行と**同じ関数**（collectClosingCandidatesUpTo）を通す — 別に
 * 書くと試算と実行の結果がずれ、試算そのものが信用できなくなる。
 *
 * ★ 数えられるのは**いま未請求の出荷だけ**。指定日までに新しく出荷された分は
 *   まだ存在しないので入らない（画面にもそう書く）。
 */
export async function simulateClosing(
  dateIso: string,
): Promise<ActionResult<ClosingSimulation>> {
  const tr = await getTranslations();
  const targetDate = parseClosingDate(dateIso);
  if (!targetDate) return actionError(tr("billing.closingActions.invalidDate"));
  // 読むだけなので READ で足りる（実行は UPDATE）。
  const authz = await checkPermission("billing_closing", "READ");
  if (!authz.ok) return actionError(authz.error);
  try {
    const { collectClosingCandidatesUpTo } = await import("./data");
    const candidates = await collectClosingCandidatesUpTo(targetDate);
    return actionOk(
      summarizeClosingSimulation(
        candidates.map((c) => ({
          customerName: c.customerName,
          closingDate: c.closingDate.toISOString(),
          shipmentNumbers: c.shipmentNumbers,
          totalAmount: c.totalAmount,
        })),
        dateIso,
      ),
    );
  } catch (e) {
    const { prismaErrorMessage } = await import("@/lib/server-action");
    return actionError(
      prismaErrorMessage(e, tr("billing.closingActions.simulateFailed"), tr),
    );
  }
}

/**
 * 請求書を生成 (PENDING → PROCESSED)。生成した請求書番号を返す —
 * クライアントは請求書詳細へ遷移する。
 */
export async function processClosing(
  id: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  return generateInvoiceForClosing(id);
}

// ── まとめて請求書を生成 ─────────────────────────────────────────────────────

export interface BulkClosingResult {
  /** 生成できた請求書（処理した順）。結果ポップアップの一覧に使う。 */
  invoices: {
    invoiceNumber: string;
    customerName: string;
    totalAmount: number;
  }[];
  /** 生成できなかった締日行と、その理由。 */
  failures: { id: string; customerName: string; error: string }[];
}

/**
 * 選んだ締日行をまとめて請求書にする。
 *
 * 月初に何十件も並ぶ PENDING を 1 件ずつ開いて押していくのは、ただの作業で
 * しかないうえ、押し忘れた 1 件が翌月まで請求されないまま残る。
 *
 * ★ **1 件ずつ独立して処理する**（全体を 1 つの tx にしない）。1 社で
 *   「対象の出荷が無い」「締日前」のような理由が出ても、他の会社の請求書は
 *   出せたほうがよい — まとめて失敗させると、結局 1 件ずつやり直すことになる。
 *   失敗した行は理由つきで返し、画面が並べる。
 *
 * ★ 請求書の中身の作り方は processClosing と**同じ関数**を通る。別に書くと、
 *   1 件ずつ押したときとまとめて押したときで請求額が変わり得る。
 */
export async function processClosings(
  ids: string[],
): Promise<ActionResult<BulkClosingResult>> {
  const tr = await getTranslations();
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));

  // 名前は失敗の説明に要る（id だけ返されても、どの会社か分からない）。
  const rows = await prisma.billingClosing.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      closingDate: true,
      customerBp: { select: { name: true } },
    },
    orderBy: [{ closingDate: "asc" }],
  });
  const nameById = new Map(
    rows.map((r) => [
      r.id,
      localized(r.customerBp.name as LocalizedText | null),
    ]),
  );

  const invoices: BulkClosingResult["invoices"] = [];
  const failures: BulkClosingResult["failures"] = [];
  for (const row of rows) {
    const result = await generateInvoiceForClosing(row.id);
    if (result.ok && result.data) {
      invoices.push({
        invoiceNumber: result.data.invoiceNumber,
        customerName: nameById.get(row.id) ?? row.id,
        totalAmount: result.data.totalAmount,
      });
    } else if (!result.ok) {
      failures.push({
        id: row.id,
        customerName: nameById.get(row.id) ?? row.id,
        error: result.error,
      });
    }
  }
  return actionOk({ invoices, failures });
}
