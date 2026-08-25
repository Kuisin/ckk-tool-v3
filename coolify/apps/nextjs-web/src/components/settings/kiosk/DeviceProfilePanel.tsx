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
import { useFormat } from "@/components/layout/PreferencesProvider";
import { OwnershipBadge } from "@/components/settings/security/ownership";
import { FieldValue } from "@/components/ui/FieldValue";
// server-only の kiosk-admin からは **型だけ** 取る。値（関数）を取ると
// クライアントバンドルが Prisma を掴んで画面が 500 になる。
import { deviceRiskFlags } from "@/lib/device-profile-core";
import type { KioskDeviceRow } from "@/lib/kiosk-admin";

function yesNo(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "有効" : "無効";
}

export function DeviceProfilePanel({ device }: { device: KioskDeviceRow }) {
  const fmt = useFormat();
  const profile = device.deviceProfile;
  const flags = deviceRiskFlags(profile);

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={5}>端末情報</Title>
        {profile && (
          <Badge
            color="green"
            leftSection={<IconShieldCheck size={12} />}
            size="sm"
            variant="light"
          >
            署名検証済み
          </Badge>
        )}
      </Group>

      {flags.length > 0 && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          mb="sm"
          title="この端末で気をつける点"
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
          label="端末区分"
          value={
            <OwnershipBadge
              size="sm"
              source={device.ownershipSource}
              value={device.ownership}
            />
          }
        />
        <FieldValue
          label="判定根拠"
          value={
            <Text ff="monospace" size="xs">
              {device.ownershipSource ?? "—"}
            </Text>
          }
        />
        <FieldValue
          label="鍵フィンガープリント"
          value={
            device.fingerprint ? (
              <Text ff="monospace" size="xs" style={{ wordBreak: "break-all" }}>
                {device.fingerprint}
              </Text>
            ) : (
              "未束縛"
            )
          }
        />

        <FieldValue
          label="最終 IP（最後に観測）"
          value={device.lastIpAddress ?? "—"}
        />
        <FieldValue label="リンク時 IP" value={device.linkedIpAddress ?? "—"} />
        <FieldValue
          label="プロファイル取得"
          value={
            device.deviceProfileAt ? fmt.dateTime(device.deviceProfileAt) : "—"
          }
        />

        {profile && (
          <>
            <FieldValue
              label="メーカー / 機種"
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
            <FieldValue label="アプリ版" value={profile.appVersion ?? "—"} />
            <FieldValue
              label="デバイスオーナー"
              value={profile.isDeviceOwner ? "はい" : "いいえ"}
            />
            <FieldValue
              label="Lock Task"
              value={
                profile.lockTaskState === null
                  ? "—"
                  : profile.lockTaskState > 0
                    ? "固定中"
                    : "解除"
              }
            />
            <FieldValue
              label="USB デバッグ / 開発者オプション"
              value={`${yesNo(profile.adbEnabled)} / ${yesNo(profile.developmentSettings)}`}
            />
            <FieldValue
              label="インストール元"
              value={profile.installer ?? "—"}
            />
            <FieldValue
              label="登録 ID（enrollmentId）"
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
            <FieldValue label="ビルドタグ" value={profile.buildTags ?? "—"} />
          </>
        )}

        <FieldValue
          fullWidth
          label="User-Agent（最後に観測）"
          value={
            <Text size="xs" style={{ wordBreak: "break-all" }}>
              {device.userAgent ?? "—"}
            </Text>
          }
        />
      </SimpleGrid>

      {!profile && (
        <Text c="dimmed" mt="sm" size="xs">
          端末プロファイルは専用アプリ v0.6.0 以降が送ります。旧版の端末では
          空欄のままで、アテステーション自体は従来どおり動作します。
        </Text>
      )}
    </Paper>
  );
}
