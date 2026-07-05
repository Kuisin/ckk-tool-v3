import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";

/**
 * 価格表 新規作成 (SA11). `?customer=&product=` locks them (種別を追加 flow).
 */
export default async function PriceListNewPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; product?: string }>;
}) {
  const { customer, product } = await searchParams;
  return (
    <PriceListTypeForm
      lockedCustomerId={customer}
      lockedProductId={product}
      mode="create"
    />
  );
}
