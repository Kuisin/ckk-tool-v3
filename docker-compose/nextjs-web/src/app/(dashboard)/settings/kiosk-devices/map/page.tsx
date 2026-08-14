import { KioskFloorMapView } from "@/components/settings/kiosk/KioskFloorMapView";
import { requireAppRead } from "@/lib/authz-page";
import {
  listKioskDevices,
  listKioskFloorMaps,
  listKioskPlantOptions,
  listStorageLocationPins,
} from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** フロアマップ（SY09 配下）— 端末の所在ピン表示・配置。kiosk 権限（READ）。 */
export default async function KioskFloorMapPage() {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;
  const [devices, floorMaps, plantOptions, storagePins] = await Promise.all([
    listKioskDevices(),
    listKioskFloorMaps(),
    listKioskPlantOptions(),
    listStorageLocationPins(),
  ]);
  return (
    <KioskFloorMapView
      devices={devices}
      floorMaps={floorMaps}
      plantOptions={plantOptions}
      storagePins={storagePins}
    />
  );
}
