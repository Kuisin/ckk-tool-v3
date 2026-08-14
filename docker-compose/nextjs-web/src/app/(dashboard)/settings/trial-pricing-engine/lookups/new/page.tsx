import { LookupTableEditor } from "@/components/settings/LookupTableEditor";
import { requireAppRead } from "@/lib/authz-page";
import type { LookupTable } from "@/lib/trial-pricing-criteria";

export const dynamic = "force-dynamic";

/** ルックアップ表 新規作成（編集モード・空の表）。 */
export default async function NewLookupTablePage() {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const blank: LookupTable = {
    id: "",
    name: { ja: "", en: "" },
    description: "",
    keyColumns: ["key"],
    keyMatch: ["exact"],
    valueType: "number",
    default: "0",
    rows: [],
  };
  return <LookupTableEditor initial={blank} isNew />;
}
