/**
 * /device-settings — 隠し端末設定（ヘッダーの「CKK 専用端末」5タップで到達）。
 *
 * 内容の閲覧・操作は端末ごとの 6 桁設定コード（SY09 で確認/再生成）で解錠。
 * サーバーからは「端末 Cookie があるか」だけ渡し、端末情報はコード検証
 * （/api/kiosk/device-settings/verify）成功後にのみ返す。
 *
 * **言語だけは例外。** コード入力欄自体をどの言語で出すか決めるのに使う
 * だけで、氏名や拠点のような特定に繋がる情報ではないため、コード検証前に
 * 渡してよい（getDeviceForSettings() は status を絞らないので、無効化/取消
 * 済みの端末でも設定画面自体は開ける現行仕様と揃えている）。
 */

import { cookies } from "next/headers";
import { DeviceSettingsView } from "@/components/DeviceSettingsView";
import { I18nProvider } from "@/components/I18nProvider";
import { DEVICE_COOKIE, getDeviceForSettings } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function DeviceSettingsPage() {
  const store = await cookies();
  const hasDevice = store.get(DEVICE_COOKIE)?.value != null;
  const info = hasDevice ? await getDeviceForSettings() : null;
  return (
    <I18nProvider locale={info?.locale ?? "ja"}>
      <DeviceSettingsView hasDevice={hasDevice} />
    </I18nProvider>
  );
}
