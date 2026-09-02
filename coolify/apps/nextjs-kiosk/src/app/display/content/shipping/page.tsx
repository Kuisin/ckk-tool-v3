import { I18nProvider } from "@/components/I18nProvider";
import { loadShippingBoard, plantNameOf } from "@/lib/display-board";
import { optionNumber } from "@/lib/display-templates";
import { boardContext, NOT_REGISTERED } from "../_shared/options";
import { ShippingBoard } from "./ShippingBoard";

/** 出荷予定 — これから出す出荷書。出荷場の壁向け。 */
export const dynamic = "force-dynamic";

export default async function ShippingBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await boardContext("shipping", searchParams);
  if (!ctx)
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>{NOT_REGISTERED}</div>
    );

  const [rows, plantName] = await Promise.all([
    loadShippingBoard({
      plantId: ctx.plantId,
      days: optionNumber(ctx.options, "days", 7),
    }),
    plantNameOf(ctx.plantId),
  ]);

  return (
    <I18nProvider locale={ctx.locale}>
      <ShippingBoard
        plantName={plantName}
        rows={rows}
        rowsPerPage={optionNumber(ctx.options, "rows", 8)}
      />
    </I18nProvider>
  );
}
