import { I18nProvider } from "@/components/I18nProvider";
import { loadProductionBoard, plantNameOf } from "@/lib/display-board";
import { sortBoardEntries, toBoardEntry } from "@/lib/display-board-core";
import { optionBoolean, optionNumber } from "@/lib/display-templates";
import { boardContext, NOT_REGISTERED } from "../_shared/options";
import { ProductionBoard } from "./ProductionBoard";

/**
 * 生産状況 — 進行中の指示書を、いま流れている工程と担当者つきで並べる。
 * ライン脇の定番。
 */
export const dynamic = "force-dynamic";

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await boardContext("production", searchParams);
  if (!ctx)
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>{NOT_REGISTERED}</div>
    );

  const [rows, plantName] = await Promise.all([
    loadProductionBoard({
      plantId: ctx.plantId,
      includePending: optionBoolean(ctx.options, "includePending", true),
    }),
    plantNameOf(ctx.plantId),
  ]);

  return (
    <I18nProvider locale={ctx.locale}>
      <ProductionBoard
        entries={sortBoardEntries(rows.map(toBoardEntry))}
        plantName={plantName}
        rowsPerPage={optionNumber(ctx.options, "rows", 8)}
      />
    </I18nProvider>
  );
}
