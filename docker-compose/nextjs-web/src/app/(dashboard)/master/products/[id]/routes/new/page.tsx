import { notFound } from "next/navigation";
import {
  fetchPlantOptions,
  fetchSupplierOptions,
} from "@/app/(dashboard)/production/work-orders/data";
import { RouteEditorForm } from "@/components/master/products/RouteEditorForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { loadCatalog } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** 製品工程ルート 新規作成 (MS23 工程タブ). */
export default async function ProductRouteNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [product, catalog, plantOptions, supplierOptions] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, yearMonth: true, seq: true },
    }),
    loadCatalog(),
    fetchPlantOptions(),
    fetchSupplierOptions(),
  ]);
  if (!product) notFound();

  const productLabel =
    formatProductNumber(product.yearMonth, product.seq) ??
    localized(product.name as LocalizedText | null);

  return (
    <RouteEditorForm
      catalogSteps={catalog.steps}
      mode="create"
      plantOptions={plantOptions}
      productId={product.id}
      productLabel={productLabel}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
