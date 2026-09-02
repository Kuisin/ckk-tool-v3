/**
 * /device-error — サーバー側の門。端末の言語（SY09 で設定）を解決して包む。
 *
 * DISABLED/REVOKED でも開ける画面なので getDeviceForSettings()（status を
 * 絞らない）で引く。Cookie 自体が無ければ既定の ja。
 */

import { cookies } from "next/headers";
import { DeviceErrorView } from "@/components/DeviceErrorView";
import { I18nProvider } from "@/components/I18nProvider";
import { DEVICE_COOKIE, getDeviceForSettings } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function DeviceErrorPage() {
  const store = await cookies();
  const hasDevice = store.get(DEVICE_COOKIE)?.value != null;
  const info = hasDevice ? await getDeviceForSettings() : null;
  return (
    <I18nProvider locale={info?.locale ?? "ja"}>
      <DeviceErrorView />
    </I18nProvider>
  );
}
