import "server-only";

/**
 * data.ts — 注文書取込（SY0C）で、フォルダのファイルと注文請書を結びつける。
 *
 * 取込フォルダのファイル名には採番時に番号が焼き込まれる
 * （`ORD-YYYYMM-NNNNN-<元名>` — lib/intake.ts）。その番号で注文請書を引き、
 * 画面に「どの書類になったか」（状態・顧客・明細数）を出してリンクする。
 * これが無いと、SY0C はファイル名の羅列でしかなく、取込結果を見るには
 * 番号を手で SA04 の一覧から探す必要があった。
 */

import type {
  IntakeSource,
  OrderAcceptanceStatus,
} from "@/components/sales/order-acceptances/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { parseIntakeFileNumber } from "@/lib/intake-core";
import type { IntakeFolderStatus } from "@/lib/intake-folder";

/** ファイル 1 本に対応する注文請書（見つかったものだけ）。 */
export interface IntakeDocRef {
  /** ORD-YYYYMM-NNNNN — 詳細 URL の id を兼ねる。 */
  number: string;
  status: OrderAcceptanceStatus;
  source: IntakeSource;
  customerName: string | null;
  itemCount: number;
  /** 抽出失敗のメッセージ（保存形式のまま — 画面側で分類して出す）。 */
  extractError: string | null;
}

/** `.processing` クレーム中の名前から元のファイル名へ。 */
function baseFileName(name: string): string {
  return name.endsWith(".processing")
    ? name.slice(0, -".processing".length)
    : name;
}

/**
 * フォルダの全ファイル名 → 注文請書の対応表（キーは ORD 番号）。
 *
 * 番号が焼き込まれていないファイル（採番前の取込待ち・手で置いた直後）は
 * 対応する書類がまだ無いので、この表に載らない = 画面では「未採番」。
 */
export async function fetchIntakeDocs(
  status: IntakeFolderStatus,
): Promise<Record<string, IntakeDocRef>> {
  // 番号が読めても、注文請書を見る権限が無い人には出さない。
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return {};

  const keys = new Map<string, { yearMonth: string; seq: number }>();
  for (const entry of [
    ...status.pending,
    ...status.processing,
    ...status.processed,
    ...status.failed,
  ]) {
    const parsed = parseIntakeFileNumber(baseFileName(entry.name));
    if (parsed) {
      keys.set(parsed.number, { yearMonth: parsed.yearMonth, seq: parsed.seq });
    }
  }
  if (keys.size === 0) return {};

  const rows = await prisma.orderAcceptance.findMany({
    where: { OR: [...keys.values()] },
    include: {
      customerBp: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const docs: Record<string, IntakeDocRef> = {};
  for (const r of rows) {
    docs[formatDocNumber("ORD", r)] = {
      number: formatDocNumber("ORD", r),
      status: r.status,
      source: r.source,
      customerName: r.customerBp
        ? localized(r.customerBp.name as LocalizedText | null)
        : null,
      itemCount: r._count.items,
      extractError: r.extractError,
    };
  }
  return docs;
}
