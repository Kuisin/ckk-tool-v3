import { KioskDevicesTable } from "@/components/settings/kiosk/KioskDevicesTable";
import { requireAppRead } from "@/lib/authz-page";
import { listKioskDevices, listKioskPlantOptions } from "@/lib/kiosk-admin";
import { fetchWorkLocationOptionsWithPlant } from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 端末管理（SY09）— キオスク端末の一覧。kiosk 権限（READ）。 */
export default async function KioskDevicesPage() {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;
  const [devices, plantOptions, workLocationOptions] = await Promise.all([
    listKioskDevices(),
    listKioskPlantOptions(),
    fetchWorkLocationOptionsWithPlant(),
  ]);
  return (
    <KioskDevicesTable
      plantOptions={plantOptions}
      rows={devices}
      workLocationOptions={workLocationOptions}
    />
  );
}
