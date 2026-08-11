/**
 * /device-settings — 隠し端末設定（ヘッダーの「CKK 専用端末」5タップで到達）。
 *
 * 内容の閲覧・操作は端末ごとの 6 桁設定コード（SY09 で確認/再生成）で解錠。
 * サーバーからは「端末 Cookie があるか」だけ渡し、端末情報はコード検証
 * （/api/kiosk/device-settings/verify）成功後にのみ返す。
 */

import { cookies } from "next/headers";
import { DeviceSettingsView } from "@/components/DeviceSettingsView";
import { DEVICE_COOKIE } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function DeviceSettingsPage() {
  const store = await cookies();
  const hasDevice = store.get(DEVICE_COOKIE)?.value != null;
  return <DeviceSettingsView hasDevice={hasDevice} />;
}
