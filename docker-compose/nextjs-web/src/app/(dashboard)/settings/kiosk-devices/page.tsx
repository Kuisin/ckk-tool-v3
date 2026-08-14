import { KioskDevicesTable } from "@/components/settings/kiosk/KioskDevicesTable";
import { requireAppRead } from "@/lib/authz-page";
import { listKioskDevices, listKioskPlantOptions } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** 端末管理（SY09）— キオスク端末の一覧。kiosk 権限（READ）。 */
export default async function KioskDevicesPage() {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;
  const [devices, plantOptions] = await Promise.all([
    listKioskDevices(),
    listKioskPlantOptions(),
  ]);
  return <KioskDevicesTable plantOptions={plantOptions} rows={devices} />;
}
