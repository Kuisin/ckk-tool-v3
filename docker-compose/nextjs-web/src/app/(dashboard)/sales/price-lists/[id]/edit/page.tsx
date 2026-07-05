import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";

/** 価格表 編集 (SA21 → edit). `id` is the (顧客, 製品, 注文種別) entry key. */
export default async function PriceListEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PriceListTypeForm entryId={id} mode="edit" />;
}
