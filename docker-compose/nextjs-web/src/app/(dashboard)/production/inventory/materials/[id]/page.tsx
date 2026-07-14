import { notFound } from "next/navigation";
import { MaterialInventoryDetail } from "@/components/production/inventory/materials/MaterialInventoryDetail";
import { fetchMaterialInventoryDetail } from "../data";

export const dynamic = "force-dynamic";

/** 素材在庫 詳細 (PD25). URL id = material_inventory.id (uuid). */
export default async function ProductionInventoryMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchMaterialInventoryDetail(id).catch(() => null);
  if (!record) notFound();

  return <MaterialInventoryDetail record={record} />;
}
