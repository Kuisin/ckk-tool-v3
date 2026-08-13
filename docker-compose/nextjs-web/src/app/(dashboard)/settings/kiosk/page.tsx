import { Stack } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { KioskSettingsPanel } from "@/components/settings/kiosk/KioskSettingsPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import {
  getKioskAppFlags,
  KIOSK_APP_CATALOG,
  KIOSK_POLICY_DEFAULTS,
} from "@/lib/kiosk-settings";

export const dynamic = "force-dynamic";

/** キオスク設定（SY0A）— ランチャーのアプリ表示 + ポリシー参照。kiosk 権限。 */
export default async function KioskSettingsPage() {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "キオスク設定"]}
          title="キオスク設定"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }

  const flags = await getKioskAppFlags();
  const p = KIOSK_POLICY_DEFAULTS;
  const policy = [
    { label: "セッション最大時間", value: `${p.sessionTtlHours} 時間` },
    { label: "アイドル自動ログアウト", value: `${p.idleTimeoutMinutes} 分` },
    {
      label: "PIN 再入力（端末未使用）",
      value: `${p.pinReverifyDeviceIdleHours} 時間`,
    },
    { label: "PIN 再入力（経過）", value: `${p.pinReverifyMaxDays} 日` },
    { label: "PIN 連続失敗の上限", value: `${p.pinMaxAttempts} 回` },
    { label: "PIN ロック時間", value: `${p.pinLockMinutes} 分` },
    { label: "端末トークン有効期間", value: `${p.deviceTokenTtlDays} 日` },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={["システム", "キオスク設定"]}
        title="キオスク設定"
      />
      <KioskSettingsPanel
        catalog={KIOSK_APP_CATALOG}
        initialFlags={flags}
        policy={policy}
      />
    </Stack>
  );
}
