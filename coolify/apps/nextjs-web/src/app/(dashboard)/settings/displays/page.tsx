import { DisplaysTable } from "@/components/settings/displays/DisplaysTable";
import { PrivilegedAccessBanner } from "@/components/settings/privileged/PrivilegedAccessBanner";
import { requireAppRead } from "@/lib/authz-page";
import { listDisplays, listPlantOptions } from "@/lib/displays-admin";

export const dynamic = "force-dynamic";

/** ディスプレイ管理（SY0I）— 現場の壁掛けテレビの一覧。kiosk 権限（READ）。 */
export default async function DisplaysPage() {
  const denied = await requireAppRead("displays");
  if (denied) return denied;

  const [rows, plantOptions] = await Promise.all([
    listDisplays(),
    listPlantOptions(),
  ]);

  return (
    <>
      {/* 登録・失効は特権操作。申請の導線をここに出す。 */}
      <PrivilegedAccessBanner code="kiosk_device" />
      <DisplaysTable plantOptions={plantOptions} rows={rows} />
    </>
  );
}
