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
import { useI18n } from "@/components/I18nProvider";

function DeviceErrorContent() {
  const router = useRouter();
  const reason = useSearchParams().get("reason");
  const { m } = useI18n();

  const message =
    reason === "DISABLED"
      ? m.deviceError.disabledMessage
      : reason === "REVOKED"
        ? m.deviceError.revokedMessage
        : m.deviceError.genericMessage;

  return (
    <Center p="md" style={{ flex: 1 }}>
      <Paper maw={480} p="xl" radius="md" w="100%" withBorder>
        <Stack align="center" gap="md">
          <IconDeviceTabletX color="var(--mantine-color-red-6)" size={64} />
          <Title order={2}>{m.deviceError.title}</Title>
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
              {m.deviceError.goToDeviceLink}
            </Button>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}

export function DeviceErrorView() {
  return (
    <Suspense>
      <DeviceErrorContent />
    </Suspense>
  );
}
