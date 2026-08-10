import { IconMathFunction } from "@tabler/icons-react";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";

export const dynamic = "force-dynamic";

/**
 * 計算基準 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default function CriteriaIndexPage() {
  return (
    <MasterDetailPlaceholder
      icon={<IconMathFunction size={24} />}
      message="左の一覧から基準を選ぶと式を編集できます"
    />
  );
}
