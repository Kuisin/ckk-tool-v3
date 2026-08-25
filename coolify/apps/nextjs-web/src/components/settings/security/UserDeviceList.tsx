"use client";

/**
 * UserDeviceList — その人が Web で使った端末の台帳（SY01 ユーザー詳細）。
 *
 * **端末を同定するものではない**。同じキッティングの社給 PC は同じシグネチャに
 * なりうるし、ブラウザや GPU ドライバの更新で別物になる。「この人がいつも
 * 使っている端末か / 初めて見る端末か」の目安として読むこと
 * （lib/device-signals-core.ts の冒頭に理由がある）。
 */

import { Group, Stack, Text } from "@mantine/core";
import { IconDeviceLaptop } from "@tabler/icons-react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import type { UserDeviceRow } from "@/lib/login-attempts";
import { OwnershipBadge } from "./ownership";

export function UserDeviceList({ devices }: { devices: UserDeviceRow[] }) {
  const fmt = useFormat();

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<IconDeviceLaptop size={28} />}
        message="登録された端末はありません"
      />
    );
  }

  return (
    <Stack gap="sm">
      {devices.map((d) => (
        <Group
          align="flex-start"
          justify="space-between"
          key={d.id}
          wrap="nowrap"
        >
          <div className="min-w-0">
            <Text fw={600} size="sm">
              {d.label ?? "不明な端末"}
            </Text>
            <Text c="dimmed" ff="mono" size="xs" truncate>
              {d.fingerprint.slice(0, 24)}…
            </Text>
            <Text c="dimmed" size="xs" truncate>
              {d.userAgent ?? "—"}
            </Text>
          </div>
          <div className="shrink-0 text-right">
            <Text className="tabular-nums" size="xs">
              {d.loginCount} 回
            </Text>
            <Text c="dimmed" size="xs">
              最終 {fmt.dateTime(d.lastSeenAt)}
            </Text>
            <Text c="dimmed" ff="mono" size="xs">
              {d.lastIpAddress ?? "—"}
            </Text>
            <OwnershipBadge source={d.ownershipSource} value={d.ownership} />
          </div>
        </Group>
      ))}
    </Stack>
  );
}
