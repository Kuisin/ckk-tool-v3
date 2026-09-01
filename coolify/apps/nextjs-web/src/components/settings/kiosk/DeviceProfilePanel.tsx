"use client";

/**
 * DeviceProfilePanel — SY09 端末詳細の「端末情報」。
 *
 * 所有区分（社用 / 私用）とその**判定根拠**、署名検証済みの端末プロファイル、
 * 最後に観測した IP/UA とリンク時のスナップショットを並べる。
 *
 * 判定根拠（ownershipSource）を必ず出すのは、「社内 NW にいる」だけの
 * 状況証拠と、端末鍵の署名という暗号的な証拠を、画面上で区別できるように
 * するため（lib/device-ownership-core.ts）。
 */

import {
  Alert,
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { OwnershipBadge } from "@/components/settings/security/ownership";
import { FieldValue } from "@/components/ui/FieldValue";
// server-only の kiosk-admin からは **型だけ** 取る。値（関数）を取ると
// クライアントバンドルが Prisma を掴んで画面が 500 になる。
import { deviceRiskFlags } from "@/lib/device-profile-core";
import type { KioskDeviceRow } from "@/lib/kiosk-admin";

function yesNo(
  tr: ReturnType<typeof useTranslations>,
  value: boolean | null,
): string {
  if (value === null) return "—";
  return value ? tr("common.enabled") : tr("common.disabled");
}

export function DeviceProfilePanel({ device }: { device: KioskDeviceRow }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const profile = device.deviceProfile;
  const flags = deviceRiskFlags(profile);

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={5}>{tr("common.deviceInformation")}</Title>
        {profile && (
          <Badge
            color="green"
            leftSection={<IconShieldCheck size={12} />}
            size="sm"
            variant="light"
          >
            {tr("settings.kiosk.signatureVerified")}
          </Badge>
        )}
      </Group>

      {flags.length > 0 && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          mb="sm"
          title={tr("settings.kiosk.thingsToWatchForOnThis")}
        >
          {flags.map((f) => (
            <Text key={f} size="xs">
              {f}
            </Text>
          ))}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <FieldValue
          label={tr("common.deviceType")}
          value={
            <OwnershipBadge
              size="sm"
              source={device.ownershipSource}
              value={device.ownership}
            />
          }
        />
        <FieldValue
          label={tr("settings.kiosk.basisForTheDecision")}
          value={
            <Text ff="monospace" size="xs">
              {device.ownershipSource ?? "—"}
            </Text>
          }
        />
        <FieldValue
          label={tr("settings.kiosk.keyFingerprint")}
          value={
            device.fingerprint ? (
              <Text ff="monospace" size="xs" style={{ wordBreak: "break-all" }}>
                {device.fingerprint}
              </Text>
            ) : (
              tr("settings.kiosk.unbound")
            )
          }
        />

        <FieldValue
          label={tr("settings.kiosk.lastIpMostRecentlySeen")}
          value={device.lastIpAddress ?? "—"}
        />
        <FieldValue
          label={tr("settings.kiosk.iPWhenLinked")}
          value={device.linkedIpAddress ?? "—"}
        />
        <FieldValue
          label={tr("settings.kiosk.fetchTheProfile")}
          value={
            device.deviceProfileAt ? fmt.dateTime(device.deviceProfileAt) : "—"
          }
        />

        {profile && (
          <>
            <FieldValue
              label={tr("settings.kiosk.manufacturerModel")}
              value={
                [profile.manufacturer, profile.model]
                  .filter(Boolean)
                  .join(" ") || "—"
              }
            />
            <FieldValue
              label="Android"
              value={
                profile.sdkInt
                  ? `API ${profile.sdkInt}${profile.securityPatch ? `（パッチ ${profile.securityPatch}）` : ""}`
                  : "—"
              }
            />
            <FieldValue
              label={tr("settings.kiosk.appVersion")}
              value={profile.appVersion ?? "—"}
            />
            <FieldValue
              label={tr("settings.kiosk.deviceOwner")}
              value={profile.isDeviceOwner ? "はい" : tr("settings.kiosk.no")}
            />
            <FieldValue
              label="Lock Task"
              value={
                profile.lockTaskState === null
                  ? "—"
                  : profile.lockTaskState > 0
                    ? tr("settings.kiosk.pinned")
                    : tr("common.release")
              }
            />
            <FieldValue
              label={tr("settings.kiosk.uSBDebuggingDeveloperOptions")}
              value={`${yesNo(tr, profile.adbEnabled)} / ${yesNo(tr, profile.developmentSettings)}`}
            />
            <FieldValue
              label={tr("settings.kiosk.installedFrom")}
              value={profile.installer ?? "—"}
            />
            <FieldValue
              label={tr("settings.kiosk.enrollmentId")}
              value={
                profile.enrollmentId ? (
                  <Text
                    ff="monospace"
                    size="xs"
                    style={{ wordBreak: "break-all" }}
                  >
                    {profile.enrollmentId}
                  </Text>
                ) : (
                  "—"
                )
              }
            />
            <FieldValue
              label={tr("settings.kiosk.buildTag")}
              value={profile.buildTags ?? "—"}
            />
          </>
        )}

        <FieldValue
          fullWidth
          label={tr("settings.kiosk.userAgentMostRecentlySeen")}
          value={
            <Text size="xs" style={{ wordBreak: "break-all" }}>
              {device.userAgent ?? "—"}
            </Text>
          }
        />
      </SimpleGrid>

      {!profile && (
        <Text c="dimmed" mt="sm" size="xs">
          {tr("settings.kiosk.theDeviceProfileIsSentBy")}
        </Text>
      )}
    </Paper>
  );
}
