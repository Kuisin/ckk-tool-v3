/**
 * HistoryPanel — 詳細画面「履歴」タブの共通表示。
 *
 * audit_logs 由来の操作履歴を AuditTimeline で表示し、空なら EmptyState を出す。
 * 各詳細ページの履歴タブはこのコンポーネントに集約する（従来はページごとに
 * EmptyState を直書きしていた）。サーバーから取得した `AuditEntry[]` を渡す。
 */

import { IconHistory } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { type AuditEntry, AuditTimeline } from "@/components/ui/shells";

export function HistoryPanel({
  entries,
  emptyMessage = "変更履歴はまだ記録されていません",
}: {
  entries: AuditEntry[];
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState icon={<IconHistory size={24} />} message={emptyMessage} />
    );
  }
  return <AuditTimeline entries={entries} />;
}
