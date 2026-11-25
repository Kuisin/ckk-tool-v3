"use server";

/**
 * price-lookup.ts — 明細エディタが単価を**その場で**引くための読み取り口。
 *
 * 明細の単価は既定で価格表が持つので、画面は「いまこの行の価格表単価はいくらか」
 * を編集中に知る必要がある（保存してから知るのでは、上書きするかどうかを
 * 決められない）。顧客は編集中に変わりうるため、顧客が決まるたびにその顧客の
 * エントリだけを取り直す — 全顧客分をクライアントへ送らない。
 *
 * 価格表は**発行会社ごとに別々**なので、引くのはその注文請書の発行会社の
 * 価格表だけ。保存済みの請書はその会社、作成中の請書は保存時と同じ規則
 * （lib/doc-company — 明細の担当拠点 → 見積書 → 既定）で決まる会社。
 *
 * 解決そのものはクライアント側の pure 関数（quotes/model の
 * resolveUnitPriceFromEntries）で行う。数量を打つたびに往復させないため。
 * 保存時はサーバーがもう一度解決するので、ここは表示のための値でよい。
 */

import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { companyForAcceptance } from "@/lib/doc-company";
import { parseDocKey } from "@/lib/doc-number";
import { loadCustomerPriceEntries } from "./price-resolve";

/** どの会社の価格表を引くか — 保存済みの請書か、作成中の請書の材料か。 */
export type AcceptancePriceCompany =
  | { acceptanceId: string }
  | {
      linePlantIds: readonly (number | null)[];
      quoteNumber: string | null;
    };

async function companyIdOf(
  company: AcceptancePriceCompany,
): Promise<number | null> {
  if ("acceptanceId" in company) {
    const key = parseDocKey(company.acceptanceId, "ORD");
    if (!key) return null;
    const row = await prisma.orderAcceptance.findUnique({
      where: { docRef: key.docRef },
      select: { ownCompanyId: true },
    });
    return row?.ownCompanyId ?? null;
  }
  const quote = company.quoteNumber?.trim();
  const data = await companyForAcceptance({
    linePlantIds: [...company.linePlantIds],
    quoteKey: quote ? parseDocKey(quote, "QOT") : null,
  });
  return data.ownCompanyId ?? null;
}

/**
 * 指定顧客 × 発行会社の価格表エントリ。権限が無い / 顧客未指定は空配列
 * （画面は「価格表なし」として自由入力に倒れる — 保存はサーバーが再解決する）。
 */
export async function fetchAcceptancePriceEntries(
  customerBpId: string | null,
  company: AcceptancePriceCompany,
): Promise<PriceListEntry[]> {
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return [];
  if (!customerBpId) return [];
  return loadCustomerPriceEntries(customerBpId, await companyIdOf(company));
}
