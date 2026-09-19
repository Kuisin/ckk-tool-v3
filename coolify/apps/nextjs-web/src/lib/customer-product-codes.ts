/**
 * customer-product-codes.ts — 顧客専用の製品コードの読み口（server-only）。
 *
 * 判定そのものは lib/customer-product-code-core.ts（純ロジック・試験あり）が
 * 持ち、ここは DB から必要な行を取ってくるだけ。
 *
 * **顧客ごとに全行を読む。** 製品マスタ本体（数万件を見込む）と違って、
 * 1 顧客が持つ対応表はせいぜい数百〜数千行なので、probe の梯子は要らない
 * — 取引先マスタ（lib/bp-match の loadBpMatchPool）と同じ扱い。
 *
 * **支店は親会社の登録を引き継ぐ。** 品番の取り決めは法人単位でするものなので、
 * 支店宛の書類でも親会社の品番が出るべき。支店に固有の登録があればそちらが勝つ。
 */

import "server-only";

import type { CustomerProductCodeEntry } from "./customer-product-code-core";
import { prisma } from "./db";

/** 印字・表示に使う 1 行（突合専用の aliases は含めない）。 */
export interface CustomerProductLabel {
  code: string;
  name: string | null;
}

/** 取引先 id → 「自分 + 親会社」の id 列（親が無ければ 1 件）。 */
async function lineageIds(bpId: string): Promise<{
  self: string;
  scope: string[];
} | null> {
  const bp = await prisma.businessPartner.findUnique({
    where: { id: bpId },
    select: { id: true, parentId: true },
  });
  if (!bp) return null;
  return {
    self: bp.id,
    scope: bp.parentId ? [bp.id, bp.parentId] : [bp.id],
  };
}

/**
 * 支店の登録を親会社より優先して 1 製品 1 行に畳む。
 * 行の並び順に依存させない（どちらが先に来ても結果が同じ）。
 *
 * `key` はその行の製品を指す id — 呼び出し側が products.id（突合）か
 * items.id（印字）かを決める。**混ぜないこと**。
 */
function preferOwn<T extends { customerBpId: string }>(
  rows: readonly T[],
  selfId: string,
  key: (row: T) => number | null,
): Map<number, T> {
  const out = new Map<number, T>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const cur = out.get(k);
    if (!cur || (cur.customerBpId !== selfId && r.customerBpId === selfId)) {
      out.set(k, r);
    }
  }
  return out;
}

/**
 * 顧客 1 人ぶんの対応表（有効行のみ）。顧客が未確定なら空 —
 * **どの顧客か分からないまま当てにいかない**（品番は顧客ごとの言葉なので、
 * 顧客を跨いで当てると別の製品を掴む）。
 */
export async function loadCustomerProductCodes(
  customerBpId: string | null | undefined,
): Promise<CustomerProductCodeEntry[]> {
  if (!customerBpId) return [];
  const lineage = await lineageIds(customerBpId);
  if (!lineage) return [];
  const rows = await prisma.customerProductCode.findMany({
    where: {
      customerBpId: { in: lineage.scope },
      isActive: true,
      product: { isActive: true },
    },
    select: {
      customerBpId: true,
      productId: true,
      code: true,
      name: true,
      aliases: true,
    },
    orderBy: { id: "asc" },
  });
  return [...preferOwn(rows, lineage.self, (r) => r.productId).values()].map(
    (r) => ({
      productId: r.productId,
      code: r.code,
      name: r.name,
      aliases: r.aliases,
    }),
  );
}

/**
 * 書類に刷るための対応表 — `itemId → { code, name }`。
 * 登録の無い製品はキーごと入らない（呼び出し側は自社の品名だけを刷る）。
 *
 * 品目統合 第 2 段 C — 納品書・請求書の明細が品目（items.id）で製品を指すように
 * なったので、こちらの鍵も品目に揃えてある。**突合の
 * `loadCustomerProductCodes` は products.id のまま**（学習エイリアスが
 * products を指しているため — 2 つの id 空間を混ぜないこと）。
 */
export async function fetchCustomerProductLabels(
  bpId: string | null | undefined,
  itemIds: readonly number[],
): Promise<Map<number, CustomerProductLabel>> {
  const out = new Map<number, CustomerProductLabel>();
  const ids = [...new Set(itemIds)];
  if (!bpId || ids.length === 0) return out;
  const lineage = await lineageIds(bpId);
  if (!lineage) return out;

  const rows = await prisma.customerProductCode.findMany({
    where: {
      customerBpId: { in: lineage.scope },
      itemId: { in: ids },
      isActive: true,
    },
    select: {
      customerBpId: true,
      itemId: true,
      code: true,
      name: true,
    },
  });
  for (const [itemId, r] of preferOwn(rows, lineage.self, (x) => x.itemId)) {
    out.set(itemId, { code: r.code, name: r.name });
  }
  return out;
}
