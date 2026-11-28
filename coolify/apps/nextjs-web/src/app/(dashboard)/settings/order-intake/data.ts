import "server-only";

/**
 * data.ts — 注文書取込（SY0C）で、フォルダのファイルと注文請書を結びつける。
 *
 * 取込フォルダのファイル名には採番時に番号が焼き込まれる
 * （`CKK~ORD-2026-00001-<元名>`。旧い取込は `ORD-YYYYMM-NNNNN-<元名>` —
 * lib/intake-core.ts）。その番号で注文請書を引き、
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
import { docIdOf } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { parseIntakeFileNumber } from "@/lib/intake-core";
import type { IntakeFolderStatus } from "@/lib/intake-folder";

/** ファイル 1 本に対応する注文請書（見つかったものだけ）。 */
export interface IntakeDocRef {
  /** 注文請書の id（`CKK~ORD-2026-00001`）— 詳細 URL の id。表示は docNo。 */
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
 * フォルダの全ファイル名 → 注文請書の対応表（キーはファイル名に焼き込まれた
 * 番号の部分そのまま — parseIntakeFileNumber().number）。
 *
 * 新しい取込は法人コード付き（doc_ref で 1 件に決まる）。旧い取込のファイルは
 * 旧番号（legacy_number）で、番号だけのものは doc_number で引く — 同じ番号が
 * 複数の法人に当たって決まらないものは載せない。
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

  // ファイル名の番号 → 引き方（鍵があれば doc_ref、無ければ番号で引く）。
  const keys = new Map<string, { docRef: string | null; docNumber: string }>();
  for (const entry of [
    ...status.pending,
    ...status.processing,
    ...status.processed,
    ...status.failed,
  ]) {
    const parsed = parseIntakeFileNumber(baseFileName(entry.name));
    if (parsed) {
      keys.set(parsed.number, {
        docRef: parsed.docKey?.docRef ?? null,
        docNumber: parsed.docNumber,
      });
    }
  }
  if (keys.size === 0) return {};

  const refs = [...keys.values()].flatMap((k) => (k.docRef ? [k.docRef] : []));
  const bare = [...keys.values()].flatMap((k) =>
    k.docRef ? [] : [k.docNumber],
  );
  const rows = await prisma.orderAcceptance.findMany({
    where: {
      OR: [
        { docRef: { in: refs } },
        { docNumber: { in: bare } },
        { legacyNumber: { in: bare } },
      ],
    },
    include: {
      customerBp: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const docs: Record<string, IntakeDocRef> = {};
  for (const [fileNumber, k] of keys) {
    const hits = rows.filter((row) =>
      k.docRef
        ? row.docRef === k.docRef
        : row.docNumber === k.docNumber || row.legacyNumber === k.docNumber,
    );
    // 番号だけで 2 法人に当たったものは、どちらの書類か決められない。
    if (hits.length !== 1) continue;
    const r = hits[0];
    docs[fileNumber] = {
      number: docIdOf(r),
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
