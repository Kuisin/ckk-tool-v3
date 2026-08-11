import { IconLock } from "@tabler/icons-react";
import { notFound } from "next/navigation";
import { KioskDeviceDetailView } from "@/components/settings/kiosk/KioskDeviceDetailView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { getKioskDevice, listRecentDeviceUsers } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** 端末詳細（SY09）— 端末情報 + 最近の利用者 + 利用履歴。kiosk 権限（READ）。 */
export default async function KioskDeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "端末管理", "端末詳細"]}
          title="端末詳細"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const device = await getKioskDevice(id);
  if (!device) notFound();
  const recentUsers = await listRecentDeviceUsers(id);
  return <KioskDeviceDetailView device={device} recentUsers={recentUsers} />;
}
