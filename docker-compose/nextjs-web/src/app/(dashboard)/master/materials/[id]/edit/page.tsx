import { notFound } from "next/navigation";
import { MaterialForm } from "@/components/master/materials/MaterialForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 編集 (MS25 edit) — コード構成はロック、属性のみ編集可. */
export default async function MasterMaterialsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.material.findUnique({
    where: { id },
    include: { materialType: true, surfaceFinish: true },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  return (
    <MaterialForm
      finishOptions={[]}
      initial={{
        id: r.id,
        code: r.code,
        materialTypeLabel: `${r.materialType.code ?? "未変換"} — ${localized(
          r.materialType.name as LocalizedText | null,
        )}`,
        surfaceFinishLabel: localized(
          r.surfaceFinish.name as LocalizedText | null,
        ),
        diameterMm: Number(r.diameterMm),
        lengthMm: Number(r.lengthMm),
        kindLabel: r.kindCode,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        unit: r.unit,
        manufacturerModel: r.manufacturerModel ?? "",
        nominalDiameterMm:
          r.nominalDiameterMm != null ? Number(r.nominalDiameterMm) : null,
        isActive: r.isActive,
        notes: r.notes ?? "",
      }}
    />
  );
}
