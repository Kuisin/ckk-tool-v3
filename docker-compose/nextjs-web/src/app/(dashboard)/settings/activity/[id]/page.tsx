import { notFound } from "next/navigation";
import { ActivityLogDetail } from "@/components/admin/ActivityLogDetail";
import { getActivityEntry } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** 操作履歴 詳細 (SY07) — audit_logs 1 件（関連ページ・ユーザーへのリンク付き）。 */
export default async function AdminActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await getActivityEntry(id);
  if (!entry) notFound();
  return <ActivityLogDetail entry={entry} />;
}
