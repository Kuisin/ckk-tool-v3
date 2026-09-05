import { PurchaseOrderNew } from "@/components/purchase/purchase-orders/PurchaseOrderNew";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材発注書 新規作成 (PU12)。
 *
 * 保存時に nextDocumentNumber("PURCHASE") で PO-YYYYMM-NNNNN を採番し、
 * 明細と合計金額をサーバー側で計算して作成する。保存後は詳細へ。
 *
 * 先頭に「AI で読み取る」パネルを置き、仕入先の見積書 / 注文請書 /
 * 発注書控えからフォームを埋められるようにしている（po-extract の
 * `/extract/purchase-order`。OCR は常にローカル、モデルの接続先は SY0E）。
 */
export default async function PurchasePurchaseOrdersNewPage() {
  const denied = await requireAppRead("purchase-orders");
  if (denied) return denied;
  const [supplierOptions, plantOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchPlantOptions(),
  ]);
  return (
    <PurchaseOrderNew
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
    />
  );
}
