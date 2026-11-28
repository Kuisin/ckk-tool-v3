import { RequirementsView } from "@/components/inventory/requirements/RequirementsView";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchItemOption,
  fetchPlantOptions,
  fetchStockRequirements,
} from "./data";

export const dynamic = "force-dynamic";

/**
 * 在庫・所要量 (ST03) — 品目 1 つ × 拠点 1 つの過去実績・未来供給/需要の時系列。
 * ST02 在庫一覧（場所から見る）とは入口が別（design.md 参照）。
 */
export default async function StockRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("stock-requirements");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (key: string): string | null => {
    const v = sp[key];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length > 0 ? s : null;
  };
  const itemIdRaw = one("item");
  const plantIdRaw = one("plant");
  const itemId = itemIdRaw ? Number(itemIdRaw) : null;
  const plantId = plantIdRaw ? Number(plantIdRaw) : null;
  const hasSelection =
    itemId != null &&
    Number.isInteger(itemId) &&
    itemId > 0 &&
    plantId != null &&
    Number.isInteger(plantId) &&
    plantId > 0;

  const [plantOptions, result, initialItemOption] = await Promise.all([
    fetchPlantOptions(),
    hasSelection
      ? fetchStockRequirements(itemId, plantId)
      : Promise.resolve(null),
    itemId != null && Number.isInteger(itemId) && itemId > 0
      ? fetchItemOption(itemId)
      : Promise.resolve(null),
  ]);

  return (
    <RequirementsView
      initialItemOption={initialItemOption}
      plantOptions={plantOptions}
      result={result}
    />
  );
}
