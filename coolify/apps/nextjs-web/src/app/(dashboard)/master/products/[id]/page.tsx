import { notFound } from "next/navigation";
import { fetchBillingOptions } from "@/app/(dashboard)/master/_shared/bp-data";
import {
  fetchDesignFilesForProduct,
  fetchDesignRequestsForProduct,
} from "@/app/(dashboard)/sales/design-requests/data";
import {
  ProductDetail,
  type ProductDetailData,
} from "@/components/master/products/ProductDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { formatPriceListNumber, formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { listProductRoutes } from "@/lib/product-routes";
import { getProductTypes } from "@/lib/product-settings";
import { PRODUCT_TYPE_SPEC_KEY } from "@/lib/product-types";

export const dynamic = "force-dynamic";

/** 製品 詳細 (MS24). */
export default async function MasterProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [
    r,
    auditEntries,
    routes,
    designFiles,
    designRequests,
    customerOptions,
    designAuthz,
  ] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        materialType: { select: { code: true, name: true } },
        priceListEntries: {
          include: {
            customerBp: true,
            variants: { orderBy: { orderType: "asc" } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    fetchAuditEntries("products", String(id)),
    listProductRoutes(id),
    // 製品の最新図面は design_files（product_id + is_latest）が正。
    // products 側に design_file_id 列は無い。
    fetchDesignFilesForProduct(id),
    fetchDesignRequestsForProduct(id),
    // 版を載せられる受注元（顧客）。空のままなら「汎用」。
    fetchBillingOptions(),
    // 図面は設計の成果物なので、製品マスタではなく設計依頼の権限で守る。
    checkPermission("design_request", "UPDATE"),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  // 製品種別（SY04）名を予約キーから解決。
  const typeId = spec.find((s) => s.key === PRODUCT_TYPE_SPEC_KEY)?.value;
  const productTypeName = typeId
    ? ((t) => (t ? t.name.ja || t.name.en : null))(
        (await getProductTypes()).find((t) => t.id === typeId),
      )
    : null;

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
    matchNames: r.matchNames,
    isActive: r.isActive,
    notes: r.notes ?? "",
    spec,
    productTypeName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // 1 行 = 1 注文種別バリアント（期間・状態はバリアント単位）。
    priceListEntries: r.priceListEntries.flatMap((e) =>
      e.variants.map((v) => ({
        // 価格表番号 PRC-… — mirrors the price-list URL id format.
        id: formatPriceListNumber({ yearMonth: e.yearMonth, seq: e.seq }),
        customerName: localized(e.customerBp.name as LocalizedText | null),
        orderType: v.orderType,
        validFrom: v.validFrom.toISOString(),
        validUntil: v.validUntil?.toISOString() ?? null,
        isActive: e.isActive && v.isActive,
      })),
    ),
  };

  return (
    <ProductDetail
      auditEntries={auditEntries}
      canManageDesign={designAuthz.ok}
      customerOptions={customerOptions}
      designFiles={designFiles}
      designRequests={designRequests}
      record={record}
      routes={routes}
    />
  );
}
