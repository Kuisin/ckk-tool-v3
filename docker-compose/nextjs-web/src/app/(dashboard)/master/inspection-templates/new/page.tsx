import { InspectionTemplateForm } from "@/components/master/inspection-templates/InspectionTemplateForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 新規作成 (MS18). */
export default async function MasterInspectionTemplatesNewPage() {
  const denied = await requireAppRead("master-inspection-templates");
  if (denied) return denied;
  return <InspectionTemplateForm />;
}
