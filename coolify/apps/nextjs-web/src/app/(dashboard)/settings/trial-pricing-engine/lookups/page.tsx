import { IconTable } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { MasterDetailPlaceholder } from "@/components/ui/MasterDetailPlaceholder";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/**
 * ルックアップ表 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default async function LookupsIndexPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  return (
    <MasterDetailPlaceholder
      icon={<IconTable size={24} />}
      message={tr("settings.trialPricingEngine.selectATableFromTheList")}
    />
  );
}
