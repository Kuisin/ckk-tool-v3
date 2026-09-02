import { DeviceTabs } from "@/components/settings/kiosk/DeviceTabs";
import { PrivilegedAccessBanner } from "@/components/settings/privileged/PrivilegedAccessBanner";
import { requireAppRead } from "@/lib/authz-page";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { listDisplays, listPlantOptions } from "@/lib/displays-admin";
import { listKioskDevices, listKioskPlantOptions } from "@/lib/kiosk-admin";
import { fetchWorkLocationOptionsWithPlant } from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/**
 * 端末管理（SY09）— 現場に置く機器を 1 か所で扱う。kiosk 権限（READ）。
 *
 * **共有端末（タブレット）とディスプレイを同じ画面に置いている**のは、
 * どちらも「拠点に据える機器」で、登録の手順も同じ（作る → リンク →
 * 有効化）だから。別アプリに分けると、現場は「これはどっちの画面で
 * 直すのか」を毎回考えることになる。違うのは中の設定だけ。
 */
export default async function KioskDevicesPage() {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;

  // ディスプレイはまだ検証環境だけの機能。app-list に別アプリを持たせず、
  // タブごとここで閉じる（dev / main は DB を共有するので、DB のフラグだと
  // 本番で開けてしまう）。
  const displaysEnabled = isDevFeatureEnabled("display");

  const [devices, plantOptions, workLocationOptions] = await Promise.all([
    listKioskDevices(),
    listKioskPlantOptions(),
    fetchWorkLocationOptionsWithPlant(),
  ]);

  // 表示内容の設定に拠点を選ぶ欄があるので、選択肢も渡す
  const [displays, displayPlantOptions] = displaysEnabled
    ? await Promise.all([listDisplays(), listPlantOptions()])
    : [[], []];

  return (
    <>
      {/* 端末の秘密と端末アクセスは別の承認。どちらの状態も先に見せる。 */}
      <PrivilegedAccessBanner code="kiosk_secret" />
      <PrivilegedAccessBanner code="kiosk_device" />
      <DeviceTabs
        displayPlantOptions={displayPlantOptions}
        displays={displays}
        displaysEnabled={displaysEnabled}
        kioskRows={devices}
        plantOptions={plantOptions}
        workLocationOptions={workLocationOptions}
      />
    </>
  );
}
