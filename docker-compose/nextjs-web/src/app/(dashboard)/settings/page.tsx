import { SystemSettingsHub } from "@/components/settings/SystemSettingsHub";

export const dynamic = "force-dynamic";

/** システム設定ハブ（SY01）— アプリ設定 + システム管理への入口。 */
export default function SettingsPage() {
  return <SystemSettingsHub />;
}
