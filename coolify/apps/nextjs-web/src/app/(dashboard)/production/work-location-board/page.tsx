import { WorkLocationBoard } from "@/components/production/work-location-board/WorkLocationBoard";
import { requireAppRead } from "@/lib/authz-page";
import { jstTodayString } from "@/lib/step-due-date-core";
import { parseBoardDate } from "@/lib/work-location-board-core";
import { fetchWorkLocationBoard } from "./data";

export const dynamic = "force-dynamic";

/**
 * 作業場所一覧 (PD09) — 選んだ日（既定 = 今日・JST）に、作業場所ごとに
 * 何の工程が待っているか。共有端末の /work-location を全作業場所ぶん並べたもの。
 */
export default async function WorkLocationBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("work-location-board");
  if (denied) return denied;
  const raw = (await searchParams).date;
  const date =
    parseBoardDate(typeof raw === "string" ? raw : null) ?? jstTodayString();
  const data = await fetchWorkLocationBoard(date);
  return <WorkLocationBoard data={data} />;
}
