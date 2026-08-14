import { notFound } from "next/navigation";
import { KioskDeviceDetailView } from "@/components/settings/kiosk/KioskDeviceDetailView";
import { requireAppRead } from "@/lib/authz-page";
import { getKioskDevice, listRecentDeviceUsers } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** 端末詳細（SY09）— 端末情報 + 最近の利用者 + 利用履歴。kiosk 権限（READ）。 */
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
  const recentUsers = await listRecentDeviceUsers(id);
  return <KioskDeviceDetailView device={device} recentUsers={recentUsers} />;
}
