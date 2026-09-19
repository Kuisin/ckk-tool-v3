import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { itemIdForLegacyMaterial } from "@/lib/item-legacy-material";

export const dynamic = "force-dynamic";

/**
 * 素材 詳細への**旧 id の入口**（`/master/materials/legacy/<materials.id>`）。
 * 理由と落とし方は製品側（`master/products/legacy/[productId]/page.tsx`）と同じ。
 */
export default async function MasterMaterialsLegacyRedirectPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const denied = await requireAppRead("master-materials");
  if (denied) return denied;
  const { materialId: raw } = await params;
  const materialId = Number(raw);
  if (!Number.isInteger(materialId) || materialId <= 0) notFound();
  const itemId = await itemIdForLegacyMaterial(materialId);
  if (itemId == null) notFound();
  redirect(`/master/materials/${itemId}`);
}
