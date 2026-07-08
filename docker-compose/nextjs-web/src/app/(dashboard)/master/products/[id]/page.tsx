import { notFound } from "next/navigation";
import {
  ProductDetail,
  type ProductDetailData,
} from "@/components/master/products/ProductDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatPriceListNumber, formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 詳細 (MS23). */
export default async function MasterProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        materialType: { select: { code: true, name: true } },
        priceListEntries: {
          include: { customerBp: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    fetchAuditEntries("products", String(id)),
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
    code: formatProductNumber(r.yearMonth, r.seq),
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    materialTypeId: r.materialTypeId != null ? String(r.materialTypeId) : null,
    materialTypeCode: r.materialType?.code ?? null,
    materialTypeName: r.materialType
      ? localized(r.materialType.name as LocalizedText | null)
      : "",
    diameterMm: r.diameterMm != null ? Number(r.diameterMm) : null,
    lengthMm: r.lengthMm != null ? Number(r.lengthMm) : null,
    unit: r.unit,
    isActive: r.isActive,
    notes: r.notes ?? "",
    spec,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    priceListEntries: r.priceListEntries.map((e) => ({
      // 価格表番号 PRC-… — mirrors the price-list URL id format.
      id: formatPriceListNumber({ yearMonth: e.yearMonth, seq: e.seq }),
      customerName: localized(e.customerBp.name as LocalizedText | null),
      orderType: e.orderType,
      validFrom: e.validFrom.toISOString(),
      validUntil: e.validUntil?.toISOString() ?? null,
      isActive: e.isActive,
    })),
  };

  return <ProductDetail auditEntries={auditEntries} record={record} />;
}
