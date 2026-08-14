import { PlantForm } from "@/components/master/plants/PlantForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchRegionOptions } from "../data";

export const dynamic = "force-dynamic";

/** 拠点 新規作成 (MS1B). */
export default async function MasterPlantsNewPage() {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const regionOptions = await fetchRegionOptions();
  return <PlantForm regionOptions={regionOptions} />;
}
