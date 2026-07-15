import { auth } from "@/auth";
import { NotificationSettingsForm } from "@/components/settings/NotificationSettingsForm";
import { prisma } from "@/lib/db";
import { isMailerConfigured } from "@/lib/mailer";
import { isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/** 通知設定 — チャネル ON/OFF + このデバイスの Web Push 購読。 */
export default async function NotificationSettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const setting = userId
    ? await prisma.userNotificationSetting.findUnique({ where: { userId } })
    : null;
  return (
    <NotificationSettingsForm
      initial={{
        emailEnabled: setting?.emailEnabled ?? true,
        pushEnabled: setting?.pushEnabled ?? true,
      }}
      mailerConfigured={isMailerConfigured()}
      pushConfigured={isPushConfigured()}
      // NEXT_PUBLIC_ のビルド時インライン化に依存しない（Coolify はランタイム env）
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
    />
  );
}
