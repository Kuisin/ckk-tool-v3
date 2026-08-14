import { IconLock } from "@tabler/icons-react";
import { KioskFloorMapView } from "@/components/settings/kiosk/KioskFloorMapView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import {
  listKioskDevices,
  listKioskFactoryOptions,
  listKioskFloorMaps,
  listStorageLocationPins,
} from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** フロアマップ（SY09 配下）— 端末の所在ピン表示・配置。kiosk 権限（READ）。 */
export default async function KioskFloorMapPage() {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "端末管理", "フロアマップ"]}
          title="フロアマップ"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const [devices, floorMaps, factoryOptions, storagePins] = await Promise.all([
    listKioskDevices(),
    listKioskFloorMaps(),
    listKioskFactoryOptions(),
    listStorageLocationPins(),
  ]);
  return (
    <KioskFloorMapView
      devices={devices}
      factoryOptions={factoryOptions}
      floorMaps={floorMaps}
      storagePins={storagePins}
    />
  );
}
