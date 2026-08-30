import { notFound } from "next/navigation";
import { ActivityLogDetail } from "@/components/admin/ActivityLogDetail";
import { getActivityEntry } from "@/lib/audit";
import { requireAppRead, requireElevation } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 操作履歴 詳細 (SY07) — audit_logs 1 件（関連ページ・ユーザーへのリンク付き）。 */
export default async function AdminActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("activity-log");
  if (denied) return denied;
  const notElevated = await requireElevation("personal_data.activity_detail");
  if (notElevated) return notElevated;
  const { id } = await params;
  const entry = await getActivityEntry(id);
  if (!entry) notFound();
  return <ActivityLogDetail entry={entry} />;
}
