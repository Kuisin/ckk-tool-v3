import { ProcessStepForm } from "@/components/master/process-steps/ProcessStepForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 工程マスタ 新規作成 (MS18). 依存先はサーバー検索で選ぶため事前ロード不要。 */
export default async function MasterProcessStepsNewPage() {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  return <ProcessStepForm />;
}
