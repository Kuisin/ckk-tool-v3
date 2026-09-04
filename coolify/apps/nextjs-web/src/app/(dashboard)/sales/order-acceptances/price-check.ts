/**
 * price-check.ts — 注文請書 明細の価格表照合（§2 価格差異検出、監査 P0-8）。
 *
 * 明細の単価を、価格表（顧客 × 製品 × 注文種別 × 数量）から解決した単価と
 * 突き合わせる。**行が価格表と食い違う理由は 2 通りある**ので、結果もそこで
 * 分ける（判定は lib/order-acceptance-price-core が唯一の定義）:
 *
 *   差異（diff）      上書きの宣言が無いのに食い違う = 説明のつかない差異。
 *                     保存時にサーバーが価格表の単価を書くので、これが出るのは
 *                     **保存後に価格表が変わった**行と、この機能より前に
 *                     作られた行。承認依頼は確認を要求して止める。
 *   上書き（override） 人が「上書き」を入れて決めた単価。差異ではなく意図なので
 *                     止めないが、承認者には見せる（何を承認するのかが変わる）。
 *
 * 製品未特定・顧客未特定は未解決であって差異ではない。価格表なし（unpriced）も
 * 差異ではない — 単価は自由入力になる。ただし **価格表はあるのに数量を覆う
 * 数量段階が無い行（noTier）は差異と同じ扱い** — 価格表の外の単価を確認なしに
 * 通さない（以前は「価格表なし」に混ざって黙って自由入力になっていた）。
 *
 * 保存時点ではなく読み出し / 依頼時に計算するため、常に最新の保存内容と
 * 現在の価格表で照合される（lib/intake.ts は不変更）。
 * サーバー専用（prisma import）— actions.ts と詳細ページから呼ぶ。
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import type { DocKey } from "@/lib/doc-number";
import { formatMoney } from "@/lib/format";
import {
  type AcceptancePriceState,
  acceptancePriceCounts,
  acceptancePriceState,
  requiresPriceAcknowledgement,
} from "@/lib/order-acceptance-price-core";
import { loadCustomerPriceEntries, priceListLookup } from "./price-resolve";

/** 明細 1 行の照合結果。 */
export interface AcceptancePriceCheckLine {
  /** order_lines.id — DRAFT エディタ行との突合キー。 */
  itemId: string;
  /** 1 始まりの行番号（sortOrder 順）。 */
  row: number;
  /** 明細の数量（数量段階なしの文言に出す）。 */
  quantity: number;
  /** 価格表から解決した期待単価。未解決（製品未特定/価格表なし）は null。 */
  expected: number | null;
  /** 明細の入力単価。未入力は null。 */
  actual: number | null;
  /** 行の状態（lib/order-acceptance-price-core）。 */
  state: AcceptancePriceState;
  /**
   * 承認依頼の前に確認が要る行（= diff または noTier）。承認依頼を止める。
   * 表示は noTier を見て文言を分ける（expected が無いので「≠ 価格表 ¥…」は出せない）。
   */
  diff: boolean;
  /** 人が宣言した上書き（= state === "override"）。止めない。 */
  overridden: boolean;
  /** 製品突合済みだが価格表エントリが無い（差異ではない）。 */
  unpriced: boolean;
  /** 価格表はあるが数量を覆う段階が無い（= state === "noTier"）。 */
  noTier: boolean;
}

/** 注文請書 1 件の照合結果。 */
export interface AcceptancePriceCheck {
  lines: AcceptancePriceCheckLine[];
  /** diff=true の行数。 */
  diffCount: number;
  /** 上書き宣言のある行数。 */
  overrideCount: number;
}

export const EMPTY_PRICE_CHECK: AcceptancePriceCheck = {
  lines: [],
  diffCount: 0,
  overrideCount: 0,
};

/**
 * 注文請書の全明細を価格表と照合する。
 * 顧客未特定は照合不能 — 全行 expected=null / diff=false（承認依頼は
 * 顧客必須チェックで別途止まる）。
 */
export async function checkAcceptancePrices(
  key: DocKey,
): Promise<AcceptancePriceCheck> {
  const tr = await getTranslations();
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
          priceOverridden: true,
        },
      },
    },
  });
  if (!acceptance || acceptance.items.length === 0) return EMPTY_PRICE_CHECK;

  const customerBpId = acceptance.customerBpId;
  const entries = await loadCustomerPriceEntries(customerBpId);

  const lines: AcceptancePriceCheckLine[] = acceptance.items.map((it, i) => {
    const productId = it.productId != null ? String(it.productId) : null;
    const actual = it.unitPrice != null ? Number(it.unitPrice) : null;
    const { expected, missReason } = priceListLookup(
      entries,
      customerBpId,
      { productId, orderType: it.orderType, quantity: it.quantity },
      tr,
    );
    const state = acceptancePriceState({
      // 顧客が未特定なら価格表を引く相手がいない — 照合不能として扱う。
      matched: Boolean(productId && customerBpId),
      expected,
      actual,
      overridden: it.priceOverridden,
      missReason,
    });
    return {
      itemId: it.id,
      row: i + 1,
      quantity: it.quantity,
      expected,
      actual,
      state,
      diff: requiresPriceAcknowledgement(state),
      overridden: state === "override",
      unpriced: state === "unpriced",
      noTier: state === "noTier",
    };
  });

  const counts = acceptancePriceCounts(lines.map((l) => l.state));
  return {
    lines,
    diffCount: counts.diffCount,
    overrideCount: counts.overrideCount,
  };
}

/**
 * 確認が要る行の表示文字列（例: `行2 ¥1,200 ≠ 価格表 ¥1,000` /
 * `行3 数量 500 に該当する価格表の数量段階なし`）。
 */
export function priceDiffSummary(
  check: AcceptancePriceCheck,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string[] {
  return check.lines
    .filter((l) => l.diff)
    .map((l) =>
      l.noTier
        ? tr("sales.orderAcceptances.priceNoTierLine", {
            row: l.row,
            quantity: l.quantity,
          })
        : tr("sales.orderAcceptances.priceDiffLine", {
            row: l.row,
            actual: formatMoney(l.actual),
            expected: formatMoney(l.expected),
          }),
    );
}

/**
 * 上書き行の表示文字列（例: `行2 ¥1,200（価格表 ¥1,000）`）。
 * 承認依頼の監査行と承認者向けの表示に使う — 承認するのは「価格表どおり」
 * ではなく「この単価で受ける」という判断なので、黙って通さない。
 */
export function priceOverrideSummary(
  check: AcceptancePriceCheck,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string[] {
  return check.lines
    .filter((l) => l.overridden)
    .map((l) =>
      tr("sales.orderAcceptances.priceOverrideLine", {
        row: l.row,
        actual: formatMoney(l.actual),
        expected: formatMoney(l.expected),
      }),
    );
}
