import { ProductForm } from "@/components/master/products/ProductForm";

export const dynamic = "force-dynamic";

/** 製品 新規作成 (MS13). 素材仕様は材種のサーバー検索で選ぶため事前ロード不要。 */
export default async function MasterProductsNewPage() {
  return <ProductForm />;
}
