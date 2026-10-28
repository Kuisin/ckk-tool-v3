import { notFound } from "next/navigation";
import {
  fetchPlantOptions,
  fetchSupplierOptions,
} from "@/app/(dashboard)/production/work-orders/data";
import { RouteEditorForm } from "@/components/master/products/RouteEditorForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
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
  // URL の id は items.id（品目統合 第 3 段）— 工程リストの絞り込みも品目で行う。
  const itemId = Number(idParam);
  const routeId = Number(routeIdParam);
  if (!Number.isInteger(itemId) || !Number.isInteger(routeId)) notFound();

  const [route, catalog, plantOptions, supplierOptions] = await Promise.all([
    prisma.productProcessRoute.findFirst({
      where: { id: routeId, itemId },
      include: {
        item: {
          select: { id: true, name: true, code: true },
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
  // 品目 id で引いているので item は必ず居るが、型は kind = PREP のぶん nullable。
  if (!route || !route.item) notFound();

  const latest = route.versions[0] ?? null;
  const productLabel =
    route.item.code ?? localized(route.item.name as LocalizedText | null);

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
      itemId={route.item.id}
      latestVersion={latest?.version ?? 0}
      mode="new-version"
      plantOptions={plantOptions}
      productLabel={productLabel}
      routeId={route.id}
      routeName={localized(route.name as LocalizedText | null)}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
