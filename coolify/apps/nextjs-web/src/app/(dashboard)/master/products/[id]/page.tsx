import { notFound } from "next/navigation";
import { fetchDesignFilesForItem } from "@/app/(dashboard)/production/design-files/data";
import { fetchDesignRequestsForItem } from "@/app/(dashboard)/sales/design-requests/data";
import {
  ProductDetail,
  type ProductDetailData,
} from "@/components/master/products/ProductDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { formatPriceListNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { listProductRoutes } from "@/lib/product-routes";
import { getProductTypes } from "@/lib/product-settings";
import { PRODUCT_TYPE_SPEC_KEY } from "@/lib/product-types";

export const dynamic = "force-dynamic";

/**
 * 製品 詳細 (MS24).
 *
 * URL の id は **items.id**（品目統合 第 3 段）。履歴だけは旧 products.id で
 * 積まれているので、その 1 件のためだけに対応を引く（actions.ts の監査の節）。
 */
export default async function MasterProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const itemId = Number(idParam);
  if (!Number.isInteger(itemId)) notFound();
  const [r, auditEntries, routes, designFiles, designRequests, customerCodes] =
    await Promise.all([
      prisma.item.findFirst({
        where: { id: itemId, itemType: "PRODUCT" },
        include: {
          requiresMaterialType: { select: { code: true, name: true } },
          // 課税区分は表示名だけ要る（判定は締日処理が lib/tax-rate.ts で行う）。
          taxCategory: { select: { name: true } },
          priceListEntryRefs: {
            include: {
              customerBp: true,
              variants: { orderBy: { orderType: "asc" } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      fetchAuditEntries("products", String(itemId)),
      listProductRoutes(itemId),
      // 製品の最新図面は design_files（item_id + is_latest）が正。
      // 製品マスタ側に design_file_id 列は無い。
      fetchDesignFilesForItem(itemId),
      fetchDesignRequestsForItem(itemId),
      // 顧客専用の製品コード（この製品を各顧客が何と呼ぶか）。
      prisma.customerProductCode.findMany({
        where: { itemId },
        include: { customerBp: { select: { name: true } } },
        orderBy: { id: "asc" },
      }),
    ]);
  if (!r) notFound();
  const canManageMaster = (await checkPermission("master", "UPDATE")).ok;

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
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    materialTypeId:
      r.requiresMaterialTypeId != null
        ? String(r.requiresMaterialTypeId)
        : null,
    materialTypeCode: r.requiresMaterialType?.code ?? null,
    materialTypeName: r.requiresMaterialType
      ? localized(r.requiresMaterialType.name as LocalizedText | null)
      : "",
    diameterMm:
      r.requiresDiameterMm != null ? Number(r.requiresDiameterMm) : null,
    lengthMm: r.requiresLengthMm != null ? Number(r.requiresLengthMm) : null,
    unit: r.unit,
    taxCategoryId: r.taxCategoryId,
    taxCategoryName: r.taxCategory
      ? localized(r.taxCategory.name as LocalizedText | null)
      : null,
    matchNames: r.matchNames,
    isActive: r.isActive,
    notes: r.notes ?? "",
    spec,
    productTypeName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // 1 行 = 1 注文種別バリアント（期間・状態はバリアント単位）。
    priceListEntries: r.priceListEntryRefs.flatMap((e) =>
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
      canManage={canManageMaster}
      customerCodes={customerCodes.map((c) => ({
        aliases: c.aliases,
        code: c.code,
        customerBpId: c.customerBpId,
        customerName: localized(c.customerBp.name as LocalizedText | null),
        isActive: c.isActive,
        name: c.name ?? "",
      }))}
      designFiles={designFiles}
      designRequests={designRequests}
      record={record}
      routes={routes}
    />
  );
}
