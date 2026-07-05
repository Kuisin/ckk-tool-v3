import { notFound } from "next/navigation";
import { PriceListDetail } from "@/components/sales/price-lists/PriceListDetail";
import { prisma } from "@/lib/db";
import {
  fetchCustomerOptions,
  fetchProductOptions,
} from "../../trial-estimates/data";
import { resolveEntryKey } from "../actions";
import { fetchPriceEntry, fetchRelatedQuotes } from "../data";

export const dynamic = "force-dynamic";

/** 価格表 詳細 (SA21). `id` is the (顧客, 製品, 注文種別) entry key. */
export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = await resolveEntryKey(decodeURIComponent(id));
  if (!key) notFound();

  const [entry, relatedQuotes, siblingRows, customerOptions, productOptions] =
    await Promise.all([
      fetchPriceEntry(key),
      fetchRelatedQuotes(key),
      prisma.priceListEntry.findMany({
        where: {
          customerBpId: key.customerBpId,
          productId: key.productId,
          NOT: { orderType: key.orderType },
        },
        select: { orderType: true },
      }),
      fetchCustomerOptions(),
      fetchProductOptions(),
    ]);
  if (!entry) notFound();

  return (
    <PriceListDetail
      customerOptions={customerOptions}
      entry={entry}
      productOptions={productOptions}
      relatedQuotes={relatedQuotes}
      siblings={siblingRows.map((s) => s.orderType)}
    />
  );
}
