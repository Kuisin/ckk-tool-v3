import { notFound } from "next/navigation";
import {
  ProductDetail,
  type ProductDetailData,
} from "@/components/master/products/ProductDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 詳細 (MS23). */
export default async function MasterProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [r, materials, auditEntries] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        material: true,
        priceListEntries: {
          include: { customerBp: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.material.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
    fetchAuditEntries("products", id),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  const record: ProductDetailData = {
    id: r.id,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    materialId: r.materialId,
    materialName: r.material
      ? localized(r.material.name as LocalizedText | null)
      : "",
    unit: r.unit,
    isActive: r.isActive,
    notes: r.notes ?? "",
    spec,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    priceListEntries: r.priceListEntries.map((e) => ({
      // Composite entry key — mirrors the price-list URL id format.
      id: `${e.customerBpId}__${e.productId}__${e.orderType}`,
      customerName: localized(e.customerBp.name as LocalizedText | null),
      orderType: e.orderType,
      validFrom: e.validFrom.toISOString(),
      validUntil: e.validUntil?.toISOString() ?? null,
      isActive: e.isActive,
    })),
  };

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.id}（${localized(m.name as LocalizedText | null)}）`,
  }));

  return (
    <ProductDetail
      auditEntries={auditEntries}
      materialOptions={materialOptions}
      record={record}
    />
  );
}
