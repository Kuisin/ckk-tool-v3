import { I18nProvider } from "@/components/I18nProvider";
import { optionBoolean, optionString } from "@/lib/display-templates";
import { boardContext, NOT_REGISTERED } from "../_shared/options";
import { AnnouncementBoard } from "./AnnouncementBoard";

/**
 * お知らせ — 決めた文章を大きく映すだけ。データを一切読まない。
 *
 * 一番単純だが、たぶん一番使われる。安全喚起や当日の連絡は「今すぐ全画面に
 * 出したい」ことが多く、そのとき集計画面より役に立つ。
 */
export const dynamic = "force-dynamic";

export default async function AnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await boardContext("announcement", searchParams);
  if (!ctx)
    return (
      <div style={{ padding: 32, color: "#c7cbe2" }}>{NOT_REGISTERED}</div>
    );

  return (
    <I18nProvider locale={ctx.locale}>
      <AnnouncementBoard
        level={optionString(ctx.options, "level", "info")}
        message={optionString(ctx.options, "message", "")}
        showClock={optionBoolean(ctx.options, "showClock", true)}
      />
    </I18nProvider>
  );
}
