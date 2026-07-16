/**
 * price-check.ts — 受注請書 明細の価格表照合（§2 価格差異検出、監査 P0-8）。
 *
 * 抽出/手入力された明細単価を、価格表（顧客 × 製品 × 注文種別 × 数量）から
 * 解決した期待単価と突き合わせる。差異（diff=true）は「製品突合済み かつ
 * 期待単価・入力単価の両方が存在し、一致しない」ときのみ — 製品未特定や
 * 価格表なし（unpriced）は未解決であって差異ではない。
 *
 * 解決ロジックは見積書・注文請書と同一（quotes/model の pure 関数 +
 * fetchEntriesForCustomer）。保存時点ではなく読み出し/依頼時に計算するため、
 * 手動編集後も常に最新の保存内容で照合される（lib/intake.ts は不変更）。
 * サーバー専用（prisma import）— actions.ts と詳細ページから呼ぶ。
 */

import { resolveUnitPriceFromEntries } from "@/components/sales/quotes/model";
import { prisma } from "@/lib/db";
import type { DocKey } from "@/lib/doc-number";
import { formatMoney } from "@/lib/format";
import { fetchEntriesForCustomer } from "../quotes/data";

/** 明細 1 行の照合結果。 */
export interface AcceptancePriceCheckLine {
  /** order_acceptance_items.id — DRAFT エディタ行との突合キー。 */
  itemId: string;
  /** 1 始まりの行番号（sortOrder 順）。 */
  row: number;
  /** 価格表から解決した期待単価。未解決（製品未特定/価格表なし）は null。 */
  expected: number | null;
  /** 明細の入力単価。未入力は null。 */
  actual: number | null;
  /** 期待単価・入力単価の両方が存在し、かつ一致しないときのみ true。 */
  diff: boolean;
  /** 製品突合済みだが価格表エントリ/段階なし（差異ではない）。 */
  unpriced: boolean;
}

/** 受注請書 1 件の照合結果。 */
export interface AcceptancePriceCheck {
  lines: AcceptancePriceCheckLine[];
  /** diff=true の行数。 */
  diffCount: number;
}

const EMPTY_CHECK: AcceptancePriceCheck = { lines: [], diffCount: 0 };

/**
 * 受注請書の全明細を価格表と照合する。
 * 顧客未特定は照合不能 — 全行 expected=null / diff=false（承認依頼は
 * 顧客必須チェックで別途止まる）。
 */
export async function checkAcceptancePrices(
  key: DocKey,
): Promise<AcceptancePriceCheck> {
  const acceptance = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: {
      customerBpId: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          productId: true,
          orderType: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });
  if (!acceptance || acceptance.items.length === 0) return EMPTY_CHECK;

  const customerBpId = acceptance.customerBpId;
  const entries = customerBpId
    ? await fetchEntriesForCustomer(customerBpId)
    : [];

  const lines: AcceptancePriceCheckLine[] = acceptance.items.map((it, i) => {
    const actual = it.unitPrice != null ? Number(it.unitPrice) : null;
    if (it.productId == null || !customerBpId) {
      // 製品未特定（or 顧客未特定）— 照合不能。差異とは扱わない。
      return {
        itemId: it.id,
        row: i + 1,
        expected: null,
        actual,
        diff: false,
        unpriced: false,
      };
    }
    const resolved = resolveUnitPriceFromEntries(
      entries,
      customerBpId,
      String(it.productId),
      it.orderType,
      it.quantity,
    );
    const expected = resolved?.unitPrice ?? null;
    return {
      itemId: it.id,
      row: i + 1,
      expected,
      actual,
      diff: expected != null && actual != null && expected !== actual,
      unpriced: resolved == null,
    };
  });

  return { lines, diffCount: lines.filter((l) => l.diff).length };
}

/** 差異行の表示文字列（例: `行2 ¥1,200 ≠ 価格表 ¥1,000`）。 */
export function priceDiffSummary(check: AcceptancePriceCheck): string[] {
  return check.lines
    .filter((l) => l.diff)
    .map(
      (l) =>
        `行${l.row} ${formatMoney(l.actual)} ≠ 価格表 ${formatMoney(l.expected)}`,
    );
}
