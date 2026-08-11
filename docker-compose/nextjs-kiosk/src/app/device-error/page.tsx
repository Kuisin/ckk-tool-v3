"use client";

/**
 * /device-error — 端末が無効化/取り消しされた場合の行き止まり画面。
 * ?reason=DISABLED|REVOKED で文言を出し分け。
 */

import {
  Alert,
  Button,
  Center,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconDeviceTabletX } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function DeviceErrorContent() {
  const router = useRouter();
  const reason = useSearchParams().get("reason");

  const message =
    reason === "DISABLED"
      ? "この端末は一時的に無効化されています。管理者に連絡してください。"
      : reason === "REVOKED"
        ? "この端末の登録は取り消されました。再登録が必要です。"
        : "この端末は利用できません。管理者に連絡してください。";

  return (
    <Center bg="var(--mantine-color-dark-7)" h="100dvh" p="md">
      <Paper maw={480} p="xl" radius="md" w="100%">
        <Stack align="center" gap="md">
          <IconDeviceTabletX color="var(--mantine-color-red-6)" size={64} />
          <Title order={2}>端末エラー</Title>
          <Alert color="red" w="100%">
            <Text>{message}</Text>
          </Alert>
          {reason === "REVOKED" && (
            <Button
              onClick={() => {
                localStorage.removeItem("kiosk_device_id");
                router.replace("/setup");
              }}
            >
              端末登録へ
            </Button>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}

export default function DeviceErrorPage() {
  return (
    <Suspense>
      <DeviceErrorContent />
    </Suspense>
  );
}
