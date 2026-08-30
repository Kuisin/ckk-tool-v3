import { Stack } from "@mantine/core";
import { NotificationEmailForm } from "@/components/settings/NotificationEmailForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { getNotificationEmailSettings } from "@/lib/notification-email-settings";

export const dynamic = "force-dynamic";

/**
 * 通知メール（SY0F）— 通知をメールで送るときの、まとめ方。system 権限。
 *
 * 以前は通知 1 件ごとに 1 通のメールが飛んでいて、アプリ内で既に読んだものにも
 * 同じだけ届いていた。承認が回る日は受信箱が通知で埋まり、本当に見るべき 1 通が
 * その中に紛れる。Microsoft Teams の「不在時のアクティビティ」と同じく、
 * **見逃した（猶予を過ぎても未読の）通知だけをまとめて 1 通**にする。
 */
export default async function NotificationEmailSettingsPage() {
  const denied = await requireAppRead("notification-email");
  if (denied) return denied;

  const initial = await getNotificationEmailSettings();

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["システム", "通知メール"]} title="通知メール" />
      <NotificationEmailForm initial={initial} />
    </Stack>
  );
}
