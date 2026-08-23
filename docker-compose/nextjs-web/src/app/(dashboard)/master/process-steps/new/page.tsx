import { ProcessStepForm } from "@/components/master/process-steps/ProcessStepForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchWorkLocationOptions,
  readWorkLocationTypes,
} from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 工程マスタ 新規作成 (MS18). 依存先はサーバー検索で選ぶため事前ロード不要。 */
export default async function MasterProcessStepsNewPage() {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const [types, workLocationOptions] = await Promise.all([
    readWorkLocationTypes(),
    fetchWorkLocationOptions(),
  ]);
  return (
    <ProcessStepForm
      workLocationOptions={workLocationOptions}
      workLocationTypeOptions={types.map((t) => ({
        value: t.key,
        label: t.label.ja || t.key,
      }))}
    />
  );
}
