import { IconSettings2 } from "@tabler/icons-react";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";

export const dynamic = "force-dynamic";

/**
 * 工程 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default function WorkOrderStepsIndexPage() {
  return (
    <MasterDetailPlaceholder
      icon={<IconSettings2 size={24} />}
      message="左の一覧から工程を選択してください"
    />
  );
}
