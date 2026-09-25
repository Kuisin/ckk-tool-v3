import { Stack } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { DesignFileVersionForm } from "@/components/production/design-files/DesignFileVersionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
import {
  fetchCustomerOptions,
  fetchDesignRequestContext,
  fetchProductItemOption,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計図 新規 (PD16) — 版を 1 つ下書きで作る（確定は版の詳細で）。
 *
 * プリフィルは 2 経路。`?request=DSG-…`（設計依頼の成果物として登録）と
 * `?item=<items.id>`（製品マスタ・一覧から）。どちらも**実在を確かめてから**
 * フォームへ渡す — クエリをそのまま信じると、存在しない依頼の成果物や
 * 別製品の図面を作れてしまう。
 */
export default async function ProductionDesignFileNewPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; item?: string }>;
}) {
  const tr = await getTranslations();
  const denied = await requireAppRead("design-files");
  if (denied) return denied;

  const sp = await searchParams;
  const itemId = Number(sp.item);
  const [
    customerOptions,
    requestContext,
    initialProduct,
    productTypes,
    itemDefs,
  ] = await Promise.all([
    fetchCustomerOptions(),
    sp.request ? fetchDesignRequestContext(sp.request) : null,
    Number.isInteger(itemId) && itemId > 0
      ? fetchProductItemOption(itemId)
      : null,
    getResolvedProductTypes(),
    getProductItemDefs(),
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.production"),
          tr("common.drawing"),
          tr("common.new"),
        ]}
        title={tr("common.registerADrawing")}
      />
      <DesignFileVersionForm
        customerOptions={customerOptions}
        initialProduct={initialProduct}
        itemDefs={itemDefs}
        productTypes={productTypes}
        requestContext={requestContext}
      />
    </Stack>
  );
}
