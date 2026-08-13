"use client";

/**
 * KioskDeviceDetailView — 端末詳細（SY09, /settings/kiosk-devices/[id]）。
 *
 * サマリ（状態・工場・場所・リンク/有効化・アテスト鍵）+ ライブのオンライン/
 * 利用者表示（useKioskPresence — 一覧と同じ解決規則）+ 最近の利用者
 * （LOGIN ログの集計）+ 利用履歴（DeviceLogList — モーダルと共用）。
 */

import {
  Anchor,
  Avatar,
  Flex,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconMapPin, IconUsers } from "@tabler/icons-react";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { KioskDeviceRecentUser, KioskDeviceRow } from "@/lib/kiosk-admin";
import { DeviceLogList } from "./KioskDeviceLogsModal";
import {
  OnlineDot,
  resolveCurrentUserName,
  resolveOnline,
  transportLabel,
} from "./KioskDevicesTable";
import { useKioskPresence } from "./useKioskPresence";

export function KioskDeviceDetailView({
  device,
  recentUsers,
}: {
  device: KioskDeviceRow;
  recentUsers: KioskDeviceRecentUser[];
}) {
  const { presence, live, transport } = useKioskPresence();
  const online = resolveOnline(device, presence, live);
  const currentUser = resolveCurrentUserName(device, presence, live);
  const liveActivity = live
    ? (presence.get(device.id)?.lastActivityAt ?? device.lastActivityAt)
    : device.lastActivityAt;

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/kiosk-devices">
            一覧へ戻る
          </SecondaryButton>
        }
        breadcrumbs={["システム", "端末管理", device.name ?? "端末詳細"]}
        status={<StatusBadge entity="KioskDevice" status={device.status} />}
        title={device.name ?? "（名称未設定）"}
      />

      {/* サマリ */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label="オンライン"
            value={
              device.status === "ACTIVE" ? (
                <Tooltip label={transportLabel(transport)} withinPortal>
                  <span>
                    <OnlineDot online={online} />
                  </span>
                </Tooltip>
              ) : (
                "—"
              )
            }
          />
          <FieldValue label="利用者" value={currentUser ?? "—"} />
          <FieldValue
            label="最終アクティビティ"
            value={liveActivity ? formatDateTime(liveActivity) : "—"}
          />
          <FieldValue label="工場" value={device.factoryLabel ?? "—"} />
          <FieldValue label="場所" value={device.location ?? "—"} />
          <FieldValue
            label="リンク日時"
            value={device.linkedAt ? formatDateTime(device.linkedAt) : "—"}
          />
          <FieldValue
            label="有効化"
            value={
              device.activatedAt
                ? `${formatDateTime(device.activatedAt)}${
                    device.activatedByName
                      ? `（${device.activatedByName}）`
                      : ""
                  }`
                : "—"
            }
          />
          <FieldValue
            label="アテステーション鍵"
            value={
              device.fingerprint ? (
                <Text ff="monospace" size="sm">
                  {device.fingerprint.slice(0, 16)}…
                </Text>
              ) : (
                "未束縛"
              )
            }
          />
          <FieldValue
            label="作成日時"
            value={device.createdAt ? formatDateTime(device.createdAt) : "—"}
          />
          <FieldValue
            label="GPS 位置（最新）"
            value={
              device.latestLocation ? (
                <Stack gap={2}>
                  <Anchor
                    href={`https://www.google.com/maps?q=${device.latestLocation.latitude},${device.latestLocation.longitude}`}
                    rel="noopener noreferrer"
                    size="sm"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    target="_blank"
                  >
                    <IconMapPin size={14} />
                    {device.latestLocation.latitude.toFixed(5)},{" "}
                    {device.latestLocation.longitude.toFixed(5)}
                    {device.latestLocation.accuracyM != null &&
                      ` (±${Math.round(device.latestLocation.accuracyM)}m)`}
                  </Anchor>
                  <Text c="dimmed" size="xs">
                    {formatDateTime(device.latestLocation.recordedAt)} 時点
                  </Text>
                </Stack>
              ) : (
                "未取得"
              )
            }
          />
        </SimpleGrid>
      </Paper>

      <Flex align="stretch" direction={{ base: "column", md: "row" }} gap="md">
        {/* 最近の利用者（LOGIN ログの集計） */}
        <Flex direction="column" style={{ flex: 5, minWidth: 0 }}>
          <Paper h="100%" p="md" radius="md" withBorder>
            <Title mb="sm" order={5}>
              最近の利用者
            </Title>
            {recentUsers.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={28} />}
                message="この端末での利用はまだありません"
              />
            ) : (
              <Stack gap="xs">
                {recentUsers.map((u) => (
                  <Group justify="space-between" key={u.userId} wrap="nowrap">
                    <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
                      <Avatar color="blue" radius="xl" size="sm">
                        {u.displayName.slice(0, 1)}
                      </Avatar>
                      <div style={{ minWidth: 0 }}>
                        <Text fw={500} size="sm" truncate>
                          {u.displayName}
                        </Text>
                        <Text c="dimmed" size="xs" truncate>
                          {u.username}
                        </Text>
                      </div>
                    </Group>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <Text c="dimmed" size="xs">
                        {formatDateTime(u.lastLoginAt)}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {u.loginCount} 回
                      </Text>
                    </div>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>
        </Flex>

        {/* 利用履歴（ページング） */}
        <Flex direction="column" style={{ flex: 7, minWidth: 0 }}>
          <Paper h="100%" p="md" radius="md" withBorder>
            <Title mb="sm" order={5}>
              利用履歴
            </Title>
            <DeviceLogList deviceId={device.id} />
          </Paper>
        </Flex>
      </Flex>
    </Stack>
  );
}
