import { notFound } from "next/navigation";
import { LookupTableEditor } from "@/components/settings/LookupTableEditor";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** ルックアップ表 詳細（編集モード）— 一覧から別ウィンドウで開く。 */
export default async function LookupTablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tableId = decodeURIComponent(id);
  const settings = await getTrialPricingSettings();
  const table = settings.lookupTables.find((t) => t.id === tableId);
  if (!table) notFound();
  return <LookupTableEditor initial={table} isNew={false} />;
}
