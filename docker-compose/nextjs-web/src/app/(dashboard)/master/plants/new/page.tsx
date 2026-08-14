import { PlantForm } from "@/components/master/plants/PlantForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 拠点 新規作成 (MS1B). */
export default async function MasterPlantsNewPage() {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  return <PlantForm />;
}
