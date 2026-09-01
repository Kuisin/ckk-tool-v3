import { IconSettings2 } from "@tabler/icons-react";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

/**
 * 工程 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default async function WorkOrderStepsIndexPage() {
  const tr = await getTr();
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  return (
    <MasterDetailPlaceholder
      icon={<IconSettings2 size={24} />}
      message={tr("左の一覧から工程を選択してください")}
    />
  );
}
