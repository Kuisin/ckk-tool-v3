import { DefectTypeForm } from "@/components/master/defect-types/DefectTypeForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 不良種類 新規作成 (MS1A). */
export default async function MasterDefectTypesNewPage() {
  const denied = await requireAppRead("master-defect-types");
  if (denied) return denied;
  return <DefectTypeForm />;
}
