import { MaterialForm } from "@/components/master/materials/MaterialForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 新規作成 (MS15) — コード構成ビルダー. */
export default async function MasterMaterialsNewPage() {
  const [finishes, manufacturers, shapes] = await Promise.all([
    prisma.materialSurfaceFinish.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.materialManufacturer.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.materialShape.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const opt = (code: string, name: unknown) => ({
    value: code,
    label: `${code} — ${localized(name as LocalizedText | null)}`,
  });

  return (
    <MaterialForm
      finishOptions={finishes.map((f) => opt(f.code, f.name))}
      manufacturerOptions={manufacturers.map((m) => opt(m.code, m.name))}
      shapeOptions={shapes.map((s) => opt(s.code, s.name))}
    />
  );
}
