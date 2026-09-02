import { Stack } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { KioskSettingsPanel } from "@/components/settings/kiosk/KioskSettingsPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import {
  getKioskAppFlags,
  KIOSK_POLICY_DEFAULTS,
  kioskAppCatalog,
} from "@/lib/kiosk-settings";

export const dynamic = "force-dynamic";

/** 共有端末設定（SY0A）— ランチャーのアプリ表示 + ポリシー参照。kiosk 権限。 */
export default async function KioskSettingsPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("kiosk-settings");
  if (denied) return denied;

  const flags = await getKioskAppFlags();
  const p = KIOSK_POLICY_DEFAULTS;
  const policy = [
    {
      label: tr("settings.kiosk.maximumSessionLength"),
      value: `${p.sessionTtlHours} 時間`,
    },
    {
      label: tr("settings.kiosk.idleAutoLogout"),
      value: `${p.idleTimeoutMinutes} 分`,
    },
    {
      label: tr("settings.kiosk.reEnterThePinDeviceUnused"),
      value: `${p.pinReverifyDeviceIdleHours} 時間`,
    },
    {
      label: tr("settings.kiosk.reEnterThePinElapsed"),
      value: `${p.pinReverifyMaxDays} 日`,
    },
    {
      label: tr("settings.kiosk.consecutivePinFailureLimit"),
      value: `${p.pinMaxAttempts} 回`,
    },
    {
      label: tr("settings.kiosk.pINLockoutTime"),
      value: `${p.pinLockMinutes} 分`,
    },
    {
      label: tr("settings.kiosk.deviceTokenLifetime"),
      value: `${p.deviceTokenTtlDays} 日`,
    },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.system"),
          tr("settings.kiosk.sharedDeviceSettings"),
        ]}
        title={tr("settings.kiosk.sharedDeviceSettings")}
      />
      <KioskSettingsPanel
        catalog={kioskAppCatalog(tr)}
        initialFlags={flags}
        policy={policy}
      />
    </Stack>
  );
}
