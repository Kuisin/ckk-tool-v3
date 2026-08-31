import { loadQualityBoard, plantNameOf } from "@/lib/display-board";
import { optionNumber } from "@/lib/display-templates";
import { boardContext, NOT_REGISTERED } from "../_shared/options";
import { QualityBoard } from "./QualityBoard";

/** 品質・不良 — 直近の不良を種類ごとに。朝礼で使う想定。 */
export const dynamic = "force-dynamic";

export default async function QualityBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await boardContext("quality", searchParams);
  if (!ctx)
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>{NOT_REGISTERED}</div>
    );

  const [summary, plantName] = await Promise.all([
    loadQualityBoard({
      plantId: ctx.plantId,
      days: optionNumber(ctx.options, "days", 7),
    }),
    plantNameOf(ctx.plantId),
  ]);

  return (
    <QualityBoard
      plantName={plantName}
      rowsPerPage={optionNumber(ctx.options, "rows", 8)}
      summary={summary}
    />
  );
}
