import { LookupTableEditor } from "@/components/settings/LookupTableEditor";
import type { LookupTable } from "@/lib/trial-pricing-criteria";

export const dynamic = "force-dynamic";

/** ルックアップ表 新規作成（編集モード・空の表）。 */
export default function NewLookupTablePage() {
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
