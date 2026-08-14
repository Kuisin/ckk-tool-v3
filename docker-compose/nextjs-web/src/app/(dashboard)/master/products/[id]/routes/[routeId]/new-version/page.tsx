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

/** 製品工程ルート 新バージョン作成 — 最新バージョンをプリフィルする。 */
export default async function ProductRouteNewVersionPage({
  params,
}: {
  params: Promise<{ id: string; routeId: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam, routeId: routeIdParam } = await params;
  const id = Number(idParam);
  const routeId = Number(routeIdParam);
  if (!Number.isInteger(id) || !Number.isInteger(routeId)) notFound();

  const [route, catalog, plantOptions, supplierOptions] = await Promise.all([
    prisma.productProcessRoute.findFirst({
      where: { id: routeId, productId: id },
      include: {
        product: {
          select: { id: true, name: true, yearMonth: true, seq: true },
        },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { steps: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    loadCatalog(),
    fetchPlantOptions(),
    fetchSupplierOptions(),
  ]);
  if (!route) notFound();

  const latest = route.versions[0] ?? null;
  const productLabel =
    formatProductNumber(route.product.yearMonth, route.product.seq) ??
    localized(route.product.name as LocalizedText | null);

  return (
    <RouteEditorForm
      catalogSteps={catalog.steps}
      initialSteps={(latest?.steps ?? []).map((s) => ({
        processStepId: s.processStepId,
        sortOrder: s.sortOrder,
        executionLocation: s.executionLocation,
        plantId: s.plantId,
        supplierBpId: s.supplierBpId,
        workHours: s.workHours == null ? null : Number(s.workHours),
      }))}
      latestVersion={latest?.version ?? 0}
      mode="new-version"
      plantOptions={plantOptions}
      productId={route.product.id}
      productLabel={productLabel}
      routeId={route.id}
      routeName={localized(route.name as LocalizedText | null)}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
