import { ProcessStepForm } from "@/components/master/process-steps/ProcessStepForm";

export const dynamic = "force-dynamic";

/** 工程マスタ 新規作成 (MS17). 依存先はサーバー検索で選ぶため事前ロード不要。 */
export default async function MasterProcessStepsNewPage() {
  return <ProcessStepForm />;
}
