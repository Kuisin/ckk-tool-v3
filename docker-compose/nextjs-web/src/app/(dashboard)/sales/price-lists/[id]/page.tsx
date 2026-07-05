import { PriceListDetail } from "@/components/sales/price-lists/PriceListDetail";

/** 価格表 詳細 (SA21). */
export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PriceListDetail id={id} />;
}
