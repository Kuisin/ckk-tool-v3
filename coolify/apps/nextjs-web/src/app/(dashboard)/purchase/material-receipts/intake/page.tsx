import { getTranslations } from "next-intl/server";
import { MaterialReceiptIntake } from "@/components/purchase/material-receipts/MaterialReceiptIntake";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材入荷 — 納品書から一括登録 (PU03 の取込口)。
 *
 * 仕入先の納品書（PDF・画像）を po-extract の `/extract/material-delivery`
 * に読ませ、素材と仕入先を突合してから、選んだ行を 1 トランザクションで
 * `material_receipts` に登録する（在庫計上も同じ tx）。
 *
 * OCR は常にローカル、どのモデルで読むかは SY0E の設定で決まる。
 */
export default async function PurchaseMaterialReceiptsIntakePage() {
  const denied = await requireAppRead("material-receipts");
  if (denied) return denied;
  // 読めるだけの人には見せない — この画面は「登録する」ための面。
  const authz = await checkPermission("material_receipt", "CREATE");
  if (!authz.ok) {
    const tr = await getTranslations();
    return (
      <AccessDenied
        breadcrumbs={[
          tr("common.purchasing"),
          {
            label: tr("common.materialReceipt"),
            href: "/purchase/material-receipts",
          },
        ]}
        message={authz.error}
        title={tr("purchase.intake.receiptPageTitle")}
      />
    );
  }
  const [supplierOptions, plantOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchPlantOptions(),
  ]);
  return (
    <MaterialReceiptIntake
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
    />
  );
}
