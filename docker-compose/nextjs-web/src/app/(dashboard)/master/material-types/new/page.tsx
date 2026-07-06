import {
  type GradeOption,
  MaterialTypeForm,
} from "@/components/master/material-types/MaterialTypeForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 材種 新規作成 (MS14) — コード構成ビルダー. */
export default async function MasterMaterialTypesNewPage() {
  const [manufacturers, grades, shapes] = await Promise.all([
    prisma.materialManufacturer.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.materialManufacturerGrade.findMany({
      where: { isActive: true },
      orderBy: [{ manufacturerCode: "asc" }, { code: "asc" }],
    }),
    prisma.materialShape.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const manufacturerOptions = manufacturers.map((m) => ({
    value: m.code,
    label: `${m.code} — ${localized(m.name as LocalizedText | null)}`,
  }));
  const gradeOptions: GradeOption[] = grades.map((g) => ({
    value: g.code,
    label: `${g.code} — ${localized(g.name as LocalizedText | null)}`,
    manufacturerCode: g.manufacturerCode,
  }));
  const shapeOptions = shapes.map((s) => ({
    value: s.code,
    label: `${s.code} — ${localized(s.name as LocalizedText | null)}`,
  }));

  return (
    <MaterialTypeForm
      gradeOptions={gradeOptions}
      manufacturerOptions={manufacturerOptions}
      shapeOptions={shapeOptions}
    />
  );
}
