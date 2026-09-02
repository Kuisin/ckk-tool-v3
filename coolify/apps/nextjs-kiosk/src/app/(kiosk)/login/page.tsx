/**
 * /login — QR コードログイン（サーバー側の門）。
 *
 * 端末の言語（SY09 で設定。未設定は ja）を解決して包むだけ。状態機械の本体は
 * LoginView（クライアント）— 詳しくはそちら参照。
 */

import { I18nProvider } from "@/components/I18nProvider";
import { LoginView } from "@/components/LoginView";
import { getDevice } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const device = await getDevice({ skipAttest: true });
  const locale = device.ok ? device.device.locale : "ja";
  return (
    <I18nProvider locale={locale}>
      <LoginView />
    </I18nProvider>
  );
}
