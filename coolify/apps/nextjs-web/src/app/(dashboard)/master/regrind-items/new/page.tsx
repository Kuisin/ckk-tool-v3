import { RegrindItemForm } from "@/components/master/regrind-items/RegrindItemForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 再研磨品目 新規作成 (MS1H). */
export default async function MasterRegrindItemsNewPage() {
  const denied = await requireAppRead("master-regrind-items");
  if (denied) return denied;
  return <RegrindItemForm />;
}
