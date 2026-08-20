"use client";

/**
 * WoScanView.tsx — 指示書 QR のスキャン画面。
 *
 * QR は統一フォーマット `CKK:WO:<番号>`（指示書の帳票・検査表に印字済み）。
 * 読めたら /wo-scan/<番号> へ遷移する。QR が読めない紙（破損など）の
 * フォールバックとして番号の手入力欄も置く。
 */

import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { playWarnSound } from "@/lib/sound";
import { parseWorkOrderNumber, parseWorkOrderQr } from "@/lib/wo-scan-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { QrScannerView } from "../QrScannerView";

export function WoScanView() {
  const router = useRouter();
  const { m } = useI18n();

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const goto = (workOrderNumber: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    router.push(`/wo-scan/${workOrderNumber}`);
  };

  const handleScan = (payload: string) => {
    const n = parseWorkOrderQr(payload);
    if (n == null) {
      playWarnSound();
      setScanError(m.woScan.invalidQr);
      return;
    }
    setScanError(null);
    goto(n);
  };

  const openManual = () => {
    const n = parseWorkOrderNumber(manual);
    if (n == null) {
      setManualError(m.woScan.invalidNumber);
      return;
    }
    setManualError(null);
    goto(n);
  };

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={720} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group gap="sm" wrap="nowrap">
          <Button
            leftSection={<IconArrowLeft size={20} />}
            onClick={() => router.push("/")}
            variant="default"
          >
            {m.woScan.back}
          </Button>
          <Title order={3}>{m.woScan.title}</Title>
        </Group>

        <Text c="dimmed">{m.woScan.scanHint}</Text>

        <QrScannerView onScan={handleScan} paused={busy} />

        {scanError && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            {scanError}
          </Alert>
        )}

        <Paper p="md" radius="md" withBorder>
          <Stack gap="sm">
            <Divider label={m.woScan.manualTitle} />
            <Group align="flex-start" wrap="nowrap">
              <TextInput
                error={manualError}
                inputMode="numeric"
                onChange={(e) => setManual(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openManual();
                }}
                placeholder={m.woScan.manualPlaceholder}
                style={{ flex: 1 }}
                value={manual}
              />
              <Button
                loading={busy}
                onClick={openManual}
                rightSection={<IconArrowRight size={20} />}
              >
                {m.woScan.open}
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
