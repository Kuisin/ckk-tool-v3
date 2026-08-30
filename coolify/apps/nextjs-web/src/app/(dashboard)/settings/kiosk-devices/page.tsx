import { KioskDevicesTable } from "@/components/settings/kiosk/KioskDevicesTable";
import { PrivilegedAccessBanner } from "@/components/settings/privileged/PrivilegedAccessBanner";
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
    <>
      {/* 端末の秘密と端末アクセスは別の承認。どちらの状態も先に見せる。 */}
      <PrivilegedAccessBanner code="kiosk_secret" />
      <PrivilegedAccessBanner code="kiosk_device" />
      <KioskDevicesTable
        plantOptions={plantOptions}
        rows={devices}
        workLocationOptions={workLocationOptions}
      />
    </>
  );
}
