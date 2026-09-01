import { InspectionTemplateForm } from "@/components/master/inspection-templates/InspectionTemplateForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchApprovalGroupOptions,
  fetchInspectionTemplateGroupOptions,
} from "../data";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 新規作成 (MS19). */
export default async function MasterInspectionTemplatesNewPage() {
  const denied = await requireAppRead("master-inspection-templates");
  if (denied) return denied;
  const [groupOptions, templateGroupOptions] = await Promise.all([
    fetchApprovalGroupOptions(),
    fetchInspectionTemplateGroupOptions(),
  ]);
  return (
    <InspectionTemplateForm
      groupOptions={groupOptions}
      templateGroupOptions={templateGroupOptions}
    />
  );
}
