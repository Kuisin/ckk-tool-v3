import { notFound } from "next/navigation";
import {
  fetchPlantOptions,
  fetchSupplierOptions,
} from "@/app/(dashboard)/production/work-orders/data";
import { fetchCustomerOptions } from "@/app/(dashboard)/sales/trial-estimates/data";
import { RouteEditorForm } from "@/components/master/products/RouteEditorForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { loadCatalog } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** 製品工程ルート 新規作成 (MS24 工程タブ). URL の id は items.id。 */
export default async function ProductRouteNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const itemId = Number(idParam);
  if (!Number.isInteger(itemId)) notFound();
  const [product, catalog, plantOptions, supplierOptions, customerOptions] =
    await Promise.all([
      prisma.item.findFirst({
        where: { id: itemId, itemType: "PRODUCT" },
        select: { id: true, name: true, code: true },
      }),
      loadCatalog(),
      fetchPlantOptions(),
      fetchSupplierOptions(),
      fetchCustomerOptions(),
    ]);
  if (!product) notFound();

  const productLabel =
    product.code ?? localized(product.name as LocalizedText | null);

  return (
    <RouteEditorForm
      catalogSteps={catalog.steps}
      customerOptions={customerOptions}
      itemId={product.id}
      mode="create"
      plantOptions={plantOptions}
      productLabel={productLabel}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
