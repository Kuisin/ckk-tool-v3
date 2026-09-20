import "server-only";

import { prisma } from "@/lib/db";

/**
 * external-product-guard.ts — 他社製品（再研磨専用の品目）が再研磨以外の
 * 明細に載っていないかを、保存側で確かめる。
 *
 * 画面のピッカーは注文種別が再研磨の行でだけ他社製品を出す（option-search の
 * includeExternal）が、種別をあとから切り替えられるし、古い画面や API からも
 * 明細は来る。他社製品が本番の明細に載ると、価格表は引けず、指示書は製造分に
 * なり、完了時に他社の工具が自社の完成品として入庫する — だから保存で止める。
 *
 * 見積書・注文請書・価格表の 3 か所が同じ関数を読む。
 */

/** 渡した品目 id のうち他社製品であるものの集合。 */
export async function externalProductItemIds(
  itemIds: readonly (number | string | null | undefined)[],
): Promise<Set<number>> {
  const ids = [
    ...new Set(
      itemIds
        .map((id) => (id == null || id === "" ? null : Number(id)))
        .filter((id): id is number => id != null && Number.isInteger(id)),
    ),
  ];
  if (ids.length === 0) return new Set();
  const rows = await prisma.item.findMany({
    where: { id: { in: ids }, isExternalProduct: true },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * 他社製品が再研磨以外の種別の行に載っていれば true（= 保存を止める）。
 * 品目未特定の行は見ない（それは readiness の別の理由）。
 */
export async function hasExternalProductOutsideRegrind(
  lines: readonly {
    itemId: number | string | null | undefined;
    orderType: string;
  }[],
): Promise<boolean> {
  const external = await externalProductItemIds(lines.map((l) => l.itemId));
  if (external.size === 0) return false;
  return lines.some(
    (l) =>
      l.itemId != null &&
      l.itemId !== "" &&
      external.has(Number(l.itemId)) &&
      l.orderType !== "REGRIND",
  );
}
