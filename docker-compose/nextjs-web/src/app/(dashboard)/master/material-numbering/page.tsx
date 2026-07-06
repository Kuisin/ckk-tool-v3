import {
  type MaterialNumberingData,
  MaterialNumberingTabs,
} from "@/components/master/material-numbering/MaterialNumberingTabs";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 採番構成 (MS0C) — 材種/素材コードの構成要素マスタ管理. */
export default async function MaterialNumberingPage() {
  const [manufacturers, grades, shapes, kinds, finishes, diameters, lengths] =
    await Promise.all([
      prisma.materialManufacturer.findMany({ orderBy: { code: "asc" } }),
      prisma.materialManufacturerGrade.findMany({
        orderBy: [{ manufacturerCode: "asc" }, { code: "asc" }],
        include: { manufacturer: true },
      }),
      prisma.materialShape.findMany({ orderBy: { code: "asc" } }),
      prisma.materialKind.findMany({
        orderBy: [{ shapeCode: "asc" }, { code: "asc" }],
        include: { shape: true },
      }),
      prisma.materialSurfaceFinish.findMany({ orderBy: { code: "asc" } }),
      prisma.materialDiameter.findMany({ orderBy: { code: "asc" } }),
      prisma.materialLengthVariant.findMany({ orderBy: { code: "asc" } }),
    ]);

  const ja = (v: unknown) => localized(v as LocalizedText | null);

  const data: MaterialNumberingData = {
    manufacturers: manufacturers.map((r) => ({
      code: r.code,
      name: ja(r.name),
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    grades: grades.map((r) => ({
      code: r.code,
      parentCode: r.manufacturerCode,
      parentLabel: `${r.manufacturerCode} — ${ja(r.manufacturer.name)}`,
      name: ja(r.name),
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    shapes: shapes.map((r) => ({
      code: r.code,
      name: ja(r.name),
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    kinds: kinds.map((r) => ({
      code: r.code,
      parentCode: r.shapeCode,
      parentLabel: `${r.shapeCode} — ${ja(r.shape.name)}`,
      name: ja(r.name),
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    finishes: finishes.map((r) => ({
      code: r.code,
      name: ja(r.name),
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    diameters: diameters.map((r) => ({
      code: r.code,
      name: ja(r.displayName) || `φ${Number(r.diameterMm)}`,
      extra: `${Number(r.diameterMm)}`,
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
    lengths: lengths.map((r) => ({
      code: r.code,
      name: ja(r.displayName) || `${Number(r.lengthMm)}mm`,
      extra: `${Number(r.lengthMm)}${r.customLabel ? `（${r.customLabel}）` : ""}`,
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };

  return <MaterialNumberingTabs data={data} />;
}
