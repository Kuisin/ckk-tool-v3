import { auth } from "@/auth";
import { NotificationSettingsForm } from "@/components/profile/NotificationSettingsForm";
import { prisma } from "@/lib/db";
import { isMailerConfigured } from "@/lib/mailer";
import { isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/** 通知設定（本人） — チャネル ON/OFF + Web Push（このデバイス + 登録デバイス一覧）。 */
export default async function NotificationSettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const [setting, subscriptions] = await Promise.all([
    userId
      ? prisma.userNotificationSetting.findUnique({ where: { userId } })
      : null,
    userId
      ? prisma.pushSubscription.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { endpoint: true, userAgent: true, createdAt: true },
        })
      : [],
  ]);
  return (
    <NotificationSettingsForm
      devices={subscriptions.map((s) => ({
        endpoint: s.endpoint,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
      }))}
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
