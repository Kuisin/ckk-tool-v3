import { I18nProvider } from "@/components/I18nProvider";
import { loadPendingBoard, plantNameOf } from "@/lib/display-board";
import { optionBoolean, optionNumber } from "@/lib/display-templates";
import { boardContext, NOT_REGISTERED } from "../_shared/options";
import { PendingBoard } from "./PendingBoard";

/**
 * 未処理・手配待ち — まだ指示書が出ていない注文明細を納期順に。
 * 「手配漏れに気づく」ための画面なので、遅れているものを赤く出す。
 */
export const dynamic = "force-dynamic";

export default async function PendingBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await boardContext("pending", searchParams);
  if (!ctx)
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>{NOT_REGISTERED}</div>
    );

  const [rows, plantName] = await Promise.all([
    loadPendingBoard({
      plantId: ctx.plantId,
      days: optionNumber(ctx.options, "days", 14),
      overdueOnly: optionBoolean(ctx.options, "overdueOnly", false),
    }),
    plantNameOf(ctx.plantId),
  ]);

  return (
    <I18nProvider locale={ctx.locale}>
      <PendingBoard
        plantName={plantName}
        rows={rows}
        rowsPerPage={optionNumber(ctx.options, "rows", 8)}
      />
    </I18nProvider>
  );
}
