import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchCustomerOption,
  fetchExistingEntryRefs,
  fetchProductOption,
} from "../../trial-estimates/data";

export const dynamic = "force-dynamic";

/**
 * 価格表 新規作成 (SA11).
 *
 * 顧客×製品を選んで作成する。製品にリンクされた確定済みの試算（SA05）が
 * あれば、注文種別ごとの基準単価ソースとして選択できる（手動設定も可）。
 * `?customer=&product=` 付きのリンクは対象をプリセット・ロックする。
 */
export default async function PriceListNewPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; product?: string }>;
}) {
  const denied = await requireAppRead("price-lists");
  if (denied) return denied;
  const { customer, product } = await searchParams;

  const [customerOption, productOption, existingEntries] = await Promise.all([
    customer ? fetchCustomerOption(customer) : Promise.resolve(null),
    product ? fetchProductOption(product) : Promise.resolve(null),
    fetchExistingEntryRefs(),
  ]);

  return (
    <PriceListTypeForm
      customerOption={customerOption}
      existingEntries={existingEntries}
      lockedCustomerId={customer}
      lockedProductId={product}
      mode="create"
      productOption={productOption}
    />
  );
}
