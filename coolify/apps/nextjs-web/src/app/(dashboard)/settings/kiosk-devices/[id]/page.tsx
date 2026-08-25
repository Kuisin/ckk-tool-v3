import { notFound } from "next/navigation";
import { KioskDeviceDetailView } from "@/components/settings/kiosk/KioskDeviceDetailView";
import { requireAppRead } from "@/lib/authz-page";
import { getKioskDevice, listRecentDeviceUsers } from "@/lib/kiosk-admin";
import { listLoginAttempts } from "@/lib/login-attempts";

export const dynamic = "force-dynamic";

/**
 * 端末詳細（SY09）— 端末情報 + 最近の利用者 + 利用履歴 + 認証エラー。
 * kiosk 権限（READ）。
 *
 * 認証エラーは app.login_attempts のうちこの端末の失敗分。利用履歴
 * （kiosk_device_logs）は成功したログイン / プレゼンス遷移しか持たないので、
 * 「繰り返し弾かれている」ことはここでしか見えない。
 */
export default async function KioskDeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;
  const { id } = await params;
  const device = await getKioskDevice(id);
  if (!device) notFound();
  const [recentUsers, failures] = await Promise.all([
    listRecentDeviceUsers(id),
    listLoginAttempts({
      kioskDeviceId: id,
      outcome: "FAILURE",
      days: 90,
      take: 30,
    }),
  ]);
  return (
    <KioskDeviceDetailView
      authFailures={failures.rows}
      device={device}
      recentUsers={recentUsers}
    />
  );
}
