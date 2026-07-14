import { notFound } from "next/navigation";
import { ProductForm } from "@/components/master/products/ProductForm";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 編集 (MS23 edit). */
export default async function MasterProductsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.product.findUnique({
    where: { id },
    include: { materialType: { select: { code: true, name: true } } },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  const materialTypeLabel = r.materialType
    ? `${r.materialType.code ?? ""} — ${localized(r.materialType.name as LocalizedText | null)}`
    : "";

  return (
    <ProductForm
      initial={{
        id: r.id,
        code: formatProductNumber(r.yearMonth, r.seq),
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        materialTypeId:
          r.materialTypeId != null ? String(r.materialTypeId) : null,
        materialTypeLabel,
        diameterMm: r.diameterMm != null ? Number(r.diameterMm) : null,
        lengthMm: r.lengthMm != null ? Number(r.lengthMm) : null,
        unit: r.unit,
        isActive: r.isActive,
        notes: r.notes ?? "",
        spec,
      }}
    />
  );
}
