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

/** 準備工程リスト 新バージョン作成 — 最新バージョンをプリフィルする。 */
export default async function MasterPrepRouteNewVersionPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const { routeId: routeIdParam } = await params;
  const routeId = Number(routeIdParam);
  if (!Number.isInteger(routeId)) notFound();

  const [route, catalog, plantOptions, supplierOptions] = await Promise.all([
    prisma.productProcessRoute.findFirst({
      where: { id: routeId, kind: "PREP" },
      include: {
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
        lotInputMode: s.lotInputMode,
      }))}
      kind="PREP"
      latestVersion={latest?.version ?? 0}
      mode="new-version"
      plantOptions={plantOptions}
      routeId={route.id}
      routeName={localized(route.name as LocalizedText | null)}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
