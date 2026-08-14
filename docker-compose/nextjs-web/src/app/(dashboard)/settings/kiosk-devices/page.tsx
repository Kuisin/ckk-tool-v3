import { IconLock } from "@tabler/icons-react";
import { KioskDevicesTable } from "@/components/settings/kiosk/KioskDevicesTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { listKioskDevices, listKioskPlantOptions } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** 端末管理（SY09）— キオスク端末の一覧。kiosk 権限（READ）。 */
export default async function KioskDevicesPage() {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader breadcrumbs={["システム", "端末管理"]} title="端末管理" />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const [devices, plantOptions] = await Promise.all([
    listKioskDevices(),
    listKioskPlantOptions(),
  ]);
  return <KioskDevicesTable plantOptions={plantOptions} rows={devices} />;
}
