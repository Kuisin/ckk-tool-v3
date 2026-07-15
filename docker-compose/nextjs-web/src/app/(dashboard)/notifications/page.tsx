import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NotificationListView } from "@/components/notifications/NotificationListView";
import { fetchNotificationsPage } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * 通知一覧 — 全件（フィルタ・ページング）。状態は URL search params に保持
 * （?page= / ?unread=1 / ?type=） — URL がそのまま共有可能。
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; unread?: string; type?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const unreadOnly = params.unread === "1";
  const type = params.type || null;

  const { total, unreadCount, items } = await fetchNotificationsPage(userId, {
    page,
    pageSize: PAGE_SIZE,
    unreadOnly,
    type,
  });

  return (
    <NotificationListView
      items={items}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      type={type}
      unreadCount={unreadCount}
      unreadOnly={unreadOnly}
    />
  );
}
