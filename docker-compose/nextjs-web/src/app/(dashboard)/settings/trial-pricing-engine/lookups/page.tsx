import { IconTable } from "@tabler/icons-react";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";

export const dynamic = "force-dynamic";

/**
 * ルックアップ表 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default function LookupsIndexPage() {
  return (
    <MasterDetailPlaceholder
      icon={<IconTable size={24} />}
      message="左の一覧から表を選択してください"
    />
  );
}
