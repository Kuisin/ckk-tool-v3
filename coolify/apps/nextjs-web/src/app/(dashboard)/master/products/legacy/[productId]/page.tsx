import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { itemIdForLegacyProduct } from "@/lib/item-legacy-product";

export const dynamic = "force-dynamic";

/**
 * 製品 詳細への**旧 id の入口**（`/master/products/legacy/<products.id>`）。
 *
 * 製品マスタ (MS04) の URL は品目 id（items.id）へ移したが、旧 products.id を
 * 持ったまま外から来る経路が 2 つ残っている:
 *   - 操作履歴 (SY07) — `audit_logs` は `("products", products.id)` で積まれている
 *   - CM02 フォームの「業務データ検索」— 保存済みの回答が products.id を指す
 *     （`lib/form-schema.ts` `lookupHref`）
 * どちらも**書き換えられない過去のデータ**なので、id を読み替えるページを 1 枚
 * 置いて正しい製品へ送る。**これをやらないと、同じ値が items.id として解釈され、
 * 黙って別の製品が開く**（どちらも連番なので必ず何かに当たる）。
 *
 * 旧マスタを落とす PR で、この経路の行き先（履歴の鍵・保存済み回答）ごと
 * 決着させる。
 */
export default async function MasterProductsLegacyRedirectPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { productId: raw } = await params;
  const productId = Number(raw);
  if (!Number.isInteger(productId) || productId <= 0) notFound();
  const itemId = await itemIdForLegacyProduct(productId);
  if (itemId == null) notFound();
  redirect(`/master/products/${itemId}`);
}
