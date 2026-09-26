import "server-only";

import { prisma } from "@/lib/db";

/**
 * sales-item-guard.ts — 売る書類の明細が**正しい種類の品目**を指しているかを、
 * 保存側で確かめる 1 か所（見積書・注文請書・価格表が同じ関数を読む）。
 *
 * 品目は 3 種類あり、売り物になれるのは 2 つだけ:
 *
 *   PRODUCT  製品。本番・テスト・サンプル・その他の明細が指す。
 *            **他社製品**（`is_external_product`）はこの中の特別な行で、
 *            再研磨で預かる他社の工具を表す — **売り物ではない**。
 *   REGRIND  再研磨（役務）。再研磨の明細が指す。値段はここに付く。
 *   MATERIAL 素材。買うもの・消費するもの。売る書類には載らない。
 *
 * ## 守っている規則
 *
 *   1. 売り物の欄（`item_id`）に**他社製品は入らない** — 他社の工具を売ることは
 *      無い。預かって研ぎ直すだけで、それは工具の欄（`tool_item_id`）が持つ。
 *   2. 再研磨の明細の売り物は **REGRIND の品目**（役務）。
 *   3. 再研磨でない明細の売り物は **PRODUCT の品目**。
 *   4. 工具の欄は **PRODUCT の品目**（他社製品でも自社製品でもよい）。
 *
 * 画面のピッカーは初めから正しい種類しか出さないが、種別をあとから切り替え
 * られるし、古い画面や API からも明細は来る。**種類が噛み合っていない行は、
 * 値段が引けない・指示書が作れない・預り品が数えられない**のいずれかで後から
 * 必ず詰まるので、保存の時点で止める。
 */

/** 明細 1 行のうち、この検査に要るぶんだけ。 */
export interface SalesLineItemRef {
  /** 売り物の品目（items.id）。null = 未突合（この検査は素通り）。 */
  itemId: number | string | null | undefined;
  orderType: string;
  /** 研ぎ直す工具（再研磨の明細だけ）。 */
  toolItemId?: number | string | null | undefined;
}

type Tr = (key: string, values?: Record<string, string | number>) => string;

function toId(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

interface ItemKind {
  itemType: string;
  isExternalProduct: boolean;
}

/** 指定 id の品目の種類をまとめて引く。 */
async function loadItemKinds(
  ids: readonly number[],
): Promise<Map<number, ItemKind>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, itemType: true, isExternalProduct: true },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        itemType: r.itemType as string,
        isExternalProduct: r.isExternalProduct,
      },
    ]),
  );
}

/**
 * 明細の品目と注文種別が噛み合っているか。**最初の問題**のメッセージを返す
 * （null = 問題なし）。行番号は 1 始まりで出す。
 */
export async function salesLineItemError(
  lines: readonly SalesLineItemRef[],
  tr: Tr,
): Promise<string | null> {
  const ids = [
    ...lines.map((l) => toId(l.itemId)),
    ...lines.map((l) => toId(l.toolItemId)),
  ].filter((id): id is number => id != null);
  const kinds = await loadItemKinds(ids);

  for (const [i, line] of lines.entries()) {
    const row = i + 1;
    const itemId = toId(line.itemId);
    const item = itemId != null ? kinds.get(itemId) : null;
    if (item) {
      // 1. 他社製品は売り物の欄に入らない。
      if (item.isExternalProduct) {
        return tr("sales.salesItemGuard.externalProductIsNotSold", { row });
      }
      // 2 / 3. 種別と品目の種類が噛み合っていること。
      if (line.orderType === "REGRIND" && item.itemType !== "REGRIND") {
        return tr("sales.salesItemGuard.regrindNeedsRegrindItem", { row });
      }
      if (line.orderType !== "REGRIND" && item.itemType !== "PRODUCT") {
        return tr("sales.salesItemGuard.nonRegrindNeedsProduct", { row });
      }
    }

    // 4. 工具は製品の品目（他社製品でもよい）。
    const toolId = toId(line.toolItemId);
    if (toolId != null) {
      const tool = kinds.get(toolId);
      if (line.orderType !== "REGRIND") {
        return tr("sales.salesItemGuard.toolOnlyForRegrind", { row });
      }
      if (tool && tool.itemType !== "PRODUCT") {
        return tr("sales.salesItemGuard.toolMustBeProduct", { row });
      }
    }
  }
  return null;
}

/**
 * 価格表のエントリが持てる品目か。価格表は**売り物にだけ**作る —
 * 他社製品（預かるだけ）と素材（買うもの）には作らない。
 * 返り値はエラー文言（null = 問題なし）。
 */
export async function priceListItemError(
  itemId: number,
  orderTypes: readonly string[],
  tr: Tr,
): Promise<string | null> {
  const kinds = await loadItemKinds([itemId]);
  const item = kinds.get(itemId);
  if (!item) return null;
  if (item.isExternalProduct) {
    return tr("sales.salesItemGuard.externalProductHasNoPriceList");
  }
  if (item.itemType === "MATERIAL") {
    return tr("sales.salesItemGuard.materialHasNoPriceList");
  }
  // 再研磨の品目は再研磨の値段しか持たない（本番で売るものではない）。
  if (item.itemType === "REGRIND" && orderTypes.some((t) => t !== "REGRIND")) {
    return tr("sales.salesItemGuard.regrindItemOnlyRegrindVariant");
  }
  // 逆に、製品に再研磨のバリアントは作らない — 再研磨の値段は再研磨の品目が持つ。
  if (item.itemType === "PRODUCT" && orderTypes.some((t) => t === "REGRIND")) {
    return tr("sales.salesItemGuard.productHasNoRegrindVariant");
  }
  return null;
}
