import { notFound } from "next/navigation";
import { MaterialForm } from "@/components/master/materials/MaterialForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 素材 編集 (MS26 edit) — コード構成はロック、属性のみ編集可.
 * URL の id は items.id（品目統合 第 3 段）。
 */
export default async function MasterMaterialsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-materials");
  if (denied) return denied;
  const { id: idParam } = await params;
  const itemId = Number(idParam);
  if (!Number.isInteger(itemId)) notFound();
  const [r, finishes] = await Promise.all([
    prisma.item.findFirst({
      where: { id: itemId, itemType: "MATERIAL" },
      include: { materialType: true },
    }),
    prisma.materialSurfaceFinish.findMany(),
  ]);
  if (!r) notFound();
  const surfaceFinish = finishes.find((f) => f.code === r.surfaceFinishCode);

  const name = r.name as LocalizedText | null;

  return (
    <MaterialForm
      finishOptions={[]}
      initial={{
        id: r.id,
        code: r.code ?? "",
        materialTypeLabel: `${r.materialType?.code ?? "未変換"} — ${localized(
          r.materialType?.name as LocalizedText | null,
        )}`,
        surfaceFinishLabel: localized(
          surfaceFinish?.name as LocalizedText | null,
        ),
        diameterMm: Number(r.diameterMm ?? 0),
        lengthMm: Number(r.lengthMm ?? 0),
        kindLabel: r.kindCode ?? "",
        nameJa: name?.ja ?? "",
        nameTranslations: localizedTranslations(name),
        unit: r.unit,
        manufacturerModel: r.manufacturerModel ?? "",
        nominalDiameterMm:
          r.nominalDiameterMm != null ? Number(r.nominalDiameterMm) : null,
        matchNames: r.matchNames,
        isActive: r.isActive,
        notes: r.notes ?? "",
      }}
    />
  );
}
