import { ChargeItemForm } from "@/components/master/charge-items/ChargeItemForm";
import { requireAppRead } from "@/lib/authz-page";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";
import { getServerLocale } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** 料金マスタ 新規作成 (MS1G). */
export default async function MasterChargeItemsNewPage() {
  const denied = await requireAppRead("master-charge-items");
  if (denied) return denied;
  const taxCategoryOptions = await loadTaxCategoryOptions(
    await getServerLocale(),
  );
  return <ChargeItemForm taxCategoryOptions={taxCategoryOptions} />;
}
