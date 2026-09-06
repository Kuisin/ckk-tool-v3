import { ActivityLog } from "@/components/admin/ActivityLog";
import { listAuditActors, queryAuditEntries } from "@/lib/audit";
import { parseAuditQuery } from "@/lib/audit-filter-core";
import { requireAppRead, requireElevation } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/**
 * 操作履歴 一覧（管理者向け・全レコード横断）。
 *
 * 絞り込み・ページングはサーバー側でやる（SY0D ログイン履歴と同じ理由 —
 * 全件を持ってきてクライアントで絞る方式だと、読み込んだ分の外は検索も
 * 並べ替えもできない）。
 *
 * **昇格（`personal_data.activity_search`）はここで 1 回だけ呼ぶ。** ページ・
 * フィルタを変えるたびにこの RSC が再実行されるので `useElevation` も
 * 都度走るが、`activated_at` は初回使用でしか立たない
 * （`lib/privileged-access.ts`）ので持ち時間は伸びない — 増えるのは
 * `use_count`/`last_used_at` だけで、それはむしろ「ページをめくるたびに
 * 個人データを含む一覧を開き直している」という実態に近い記録になる。
 * ここを Route Handler / Server Action に分けない（分けると昇格を確認する
 * 場所が 2 か所になる）。
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("activity-log");
  if (denied) return denied;
  // 書類をまたいだ横断検索は特権操作（書類ごとの履歴タブは対象外）。
  const notElevated = await requireElevation("personal_data.activity_search");
  if (notElevated) return notElevated;

  const query = parseAuditQuery(await searchParams);
  const [{ rows, total }, actors] = await Promise.all([
    queryAuditEntries(query),
    listAuditActors(),
  ]);
  return (
    <ActivityLog actors={actors} entries={rows} query={query} total={total} />
  );
}
