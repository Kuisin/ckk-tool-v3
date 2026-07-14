import { notFound } from "next/navigation";
import {
  FactoryDetail,
  type FactoryDetailData,
  type FactoryInventorySummary,
} from "@/components/master/factories/FactoryDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 関連タブの在庫サマリ — 件数 + 更新日の新しい順 上位 10 行。 */
async function fetchInventorySummary(
  factoryId: number,
): Promise<FactoryInventorySummary> {
  const [productCount, materialCount, products, materials] = await Promise.all([
    prisma.productInventory.count({ where: { factoryId } }),
    prisma.materialInventory.count({ where: { factoryId } }),
    prisma.productInventory.findMany({
      where: { factoryId },
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.materialInventory.findMany({
      where: { factoryId },
      include: { material: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);
  return {
    productCount,
    materialCount,
    products: products.map((r) => ({
      id: r.id,
      productName: localized(r.product.name as LocalizedText | null),
      productCode: formatProductNumber(r.product.yearMonth, r.product.seq),
      lotNumber: r.lotNumber,
      quantity: r.quantity,
      reservedQuantity: r.reservedQuantity,
      isSemiFinished: r.isSemiFinished,
      updatedAt: r.updatedAt.toISOString(),
    })),
    materials: materials.map((r) => ({
      id: r.id,
      materialCode: r.material.code,
      materialName: localized(r.material.name as LocalizedText | null),
      // Decimal → Number（境界で変換）
      quantity: Number(r.quantity),
      reservedQuantity: Number(r.reservedQuantity),
      unit: r.unit,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/** 工場 詳細 (MS2B). */
export default async function MasterFactoriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries, inventory] = await Promise.all([
    prisma.factory.findUnique({ where: { id } }),
    fetchAuditEntries("factories", String(id)),
    fetchInventorySummary(id),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;

  const record: FactoryDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    nameKana: r.nameKana ?? "",
    countryCode: r.countryCode,
    postalCode: r.postalCode ?? "",
    addressJa: address?.ja ?? "",
    addressEn: address?.en ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    contactPerson: r.contactPerson ?? "",
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return (
    <FactoryDetail
      auditEntries={auditEntries}
      inventory={inventory}
      record={record}
    />
  );
}
