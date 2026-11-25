import { PlantForm } from "@/components/master/plants/PlantForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOwnCompanyOptions } from "../../own-companies/data";
import { fetchRegionOptions } from "../data";

export const dynamic = "force-dynamic";

/** 拠点 新規作成 (MS1C). */
export default async function MasterPlantsNewPage() {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const [regionOptions, ownCompanyOptions] = await Promise.all([
    fetchRegionOptions(),
    fetchOwnCompanyOptions(),
  ]);
  return (
    <PlantForm
      ownCompanyOptions={ownCompanyOptions}
      regionOptions={regionOptions}
    />
  );
}
