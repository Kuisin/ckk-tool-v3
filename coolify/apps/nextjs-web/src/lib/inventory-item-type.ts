/**
 * inventory-item-type.ts — 品目の種別（ItemType）を在庫台帳の区分
 * （InventoryType）へ落とす 1 か所。
 *
 * 品目は 4 種類あるが、**在庫を持つのは 3 つ、台帳の区分は 2 つ**:
 *
 *   PRODUCT  製品 … 作る / 預かる / 出す                → 台帳 PRODUCT
 *   MATERIAL 素材 … 買う / 消費する                     → 台帳 MATERIAL
 *   BLANK    仕掛ブランク … 途中まで加工した品（材種 × 径 × 長）
 *            → 台帳 PRODUCT（**本**で数える。素材のように長さ・重さで
 *              数えない — 1 本ずつ加工が進んだ品で、切り分けて使えない）
 *   REGRIND  再研磨（役務）… **在庫にならない**。研ぎ直すという仕事そのもので、
 *            預かるのは顧客の工具（PRODUCT）のほう
 *
 * 台帳側の enum は 2 値のままなので、再研磨の品目が在庫の入口へ来たら
 * そこが間違い。**黙って製品として積まず、その場で落とす** — 在庫は後から
 * 見て数を合わせる台帳なので、間違った行が 1 本入ると探し出すのが難しい。
 *
 * 画面は初めから再研磨の品目を在庫のピッカーに出さないので、ここに来るのは
 * 古いタブか API の直叩きだけ。
 */

/** 在庫台帳の区分（app.INVENTORY_TYPE）。 */
export type InventoryTypeValue = "PRODUCT" | "MATERIAL";

/** 在庫を持てる品目か。 */
export function isStockedItemType(t: string): boolean {
  return t === "PRODUCT" || t === "MATERIAL" || t === "BLANK";
}

/**
 * 台帳の区分。再研磨の品目（在庫を持たない役務）が渡ったら例外にする。
 * Server Action の try/catch がそのまま拾う。
 */
export function inventoryTypeOf(t: string): InventoryTypeValue {
  if (t === "PRODUCT" || t === "BLANK") return "PRODUCT";
  if (t === "MATERIAL") return "MATERIAL";
  // i18n-ignore — 画面に出る道が無い内部不変条件（ピッカーが出さない）
  throw new Error(`再研磨の品目は在庫を持ちません（item_type=${t}）`);
}
