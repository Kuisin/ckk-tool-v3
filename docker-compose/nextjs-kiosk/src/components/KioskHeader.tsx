/**
 * KioskHeader.tsx — 全画面共通ヘッダー（常時表示）。
 *
 * 左: アプリ識別（CKK 専用端末）/ 右: **端末名**（kiosk_devices.name）。
 * どの画面でも「どの端末を操作しているか」が一目で分かるようにする。
 * 端末名は layout.tsx がサーバー側で解決して渡す（未登録は 未登録端末）。
 */

import { Badge, Box, Group, Text } from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import { KIOSK_HEADER_HEIGHT } from "@/lib/ui";

type Props = {
  deviceName: string | null;
  registered: boolean;
};

export function KioskHeader({ deviceName, registered }: Props) {
  return (
    <Box
      component="header"
      px="lg"
      style={{
        height: KIOSK_HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--mantine-color-dark-8)",
        borderBottom: "1px solid var(--mantine-color-dark-5)",
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <IconDeviceTablet color="var(--mantine-color-blue-4)" size={22} />
        <Text fw={700} size="sm">
          CKK 専用端末
        </Text>
      </Group>
      <Group gap={8} wrap="nowrap">
        <Box
          h={8}
          style={{
            borderRadius: "50%",
            background: registered
              ? "var(--mantine-color-teal-5)"
              : "var(--mantine-color-gray-6)",
          }}
          w={8}
        />
        {registered ? (
          <Text fw={600} maw={320} size="sm" truncate>
            {deviceName ?? "（名称未設定）"}
          </Text>
        ) : (
          <Badge color="gray" variant="light">
            未登録端末
          </Badge>
        )}
      </Group>
    </Box>
  );
}
