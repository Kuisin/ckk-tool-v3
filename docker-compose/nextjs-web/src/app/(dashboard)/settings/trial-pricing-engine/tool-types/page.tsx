import { IconTool } from "@tabler/icons-react";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/**
 * 工具種管理 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default async function ToolTypesIndexPage() {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  return (
    <MasterDetailPlaceholder
      icon={<IconTool size={24} />}
      message="左の一覧から工具種を選ぶと適用基準を編集できます"
    />
  );
}
