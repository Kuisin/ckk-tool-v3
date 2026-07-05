import { PriceListTable } from "@/components/sales/price-lists/PriceListTable";
import {
  fetchCustomerOptions,
  fetchProductOptions,
} from "../trial-estimates/data";
import { fetchPriceEntries } from "./data";

export const dynamic = "force-dynamic";

/** 価格表 一覧 (SA01). */
export default async function PriceListsPage() {
  const [entries, customerOptions, productOptions] = await Promise.all([
    fetchPriceEntries(),
    fetchCustomerOptions(),
    fetchProductOptions(),
  ]);

  return (
    <PriceListTable
      customerOptions={customerOptions}
      entries={entries}
      productOptions={productOptions}
    />
  );
}
