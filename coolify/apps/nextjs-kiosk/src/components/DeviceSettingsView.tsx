"use client";

/**
 * DeviceSettingsView — 隠し端末設定画面のクライアント本体。
 *
 * フェーズ:
 *   gate     — 6 桁コード入力（PinKeypad 固定長）。検証成功まで端末情報は出さない
 *   locked   — 試行超過ロック（15分 — PIN と同ポリシー）
 *   settings — 端末情報 + リセット操作（verify が返した単回チケットで実行）
 *   no_device — 端末 Cookie なし: ローカル情報の消去だけ提供
 *
 * 操作は 2 種（どちらも実行後 /setup へ）:
 *   再リンク（リンク解除）— サーバー側もプロファイルをオープンに戻す。推奨経路
 *   ローカルリセット      — Cookie/localStorage のみ破棄。プロファイルは
 *                           リンク済みのまま → SY09 の「リンク解除」が必要と警告
 */

import {
  Alert,
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconLockOpen,
  IconMapPin,
  IconRefresh,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { PinKeypad } from "@/components/PinKeypad";
import { fillMessage, type KioskMessages } from "@/lib/i18n";
import { getWrapperVersion } from "@/lib/wrapper-bridge";

type DeviceInfo = {
  id: string;
  name: string | null;
  status: "PENDING" | "LINKED" | "ACTIVE" | "DISABLED" | "REVOKED";
  linkedAt: string | null;
  deviceTokenExpiresAt: string | null;
  fingerprint: string | null;
  /** 既定の作業場所（開始/再開時に実績へ自動記録。未設定は null）。 */
  defaultWorkLocationId: number | null;
  defaultWorkLocationLabel: string | null;
  /** 作業場所の制限トグル（ON = 許可外の工程を開始できない）。 */
  enforceWorkLocation: boolean;
};

type WorkLocationOption = { value: string; label: string };

type Phase =
  | { phase: "gate"; error: string | null; submitting: boolean }
  | { phase: "locked"; until: string | null }
  | {
      phase: "settings";
      ticket: string;
      device: DeviceInfo;
      workLocationOptions: WorkLocationOption[];
    }
  | { phase: "resetting" };

function statusLabel(status: DeviceInfo["status"], m: KioskMessages): string {
  switch (status) {
    case "PENDING":
      return m.deviceSettings.statusPending;
    case "LINKED":
      return m.deviceSettings.statusLinked;
    case "ACTIVE":
      return m.deviceSettings.statusActive;
    case "DISABLED":
      return m.deviceSettings.statusDisabled;
    case "REVOKED":
      return m.deviceSettings.statusRevoked;
  }
}

function clearLocalAndGoSetup() {
  try {
    localStorage.removeItem("kiosk_device_id");
  } catch {
    // localStorage 不可でも続行
  }
  window.location.replace("/setup");
}

export function DeviceSettingsView({ hasDevice }: { hasDevice: boolean }) {
  const router = useRouter();
  const { m } = useI18n();
  const [state, setState] = useState<Phase>({
    phase: "gate",
    error: null,
    submitting: false,
  });
  // 専用アプリ（ラッパー）のバージョン — マウント後にブリッジから取得
  const [wrapperVersion, setWrapperVersion] = useState<string | null>(null);
  useEffect(() => {
    setWrapperVersion(getWrapperVersion(m.common.unknown));
  }, [m.common.unknown]);
  const [confirmMode, setConfirmMode] = useState<"local" | "unlink" | null>(
    null,
  );
  // 既定作業場所の編集（settings フェーズのみ使用）
  const [locationDraft, setLocationDraft] = useState<string | null>(null);
  const [enforceDraft, setEnforceDraft] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationNotice, setLocationNotice] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);

  // ── 端末 Cookie なし: ローカル消去のみ ────────────────────────────────────
  if (!hasDevice) {
    return (
      <Center p="md" style={{ flex: 1 }}>
        <Paper maw={480} p="xl" radius="md" w="100%" withBorder>
          <Stack align="center" gap="md">
            <IconSettings color="var(--mantine-color-gray-5)" size={48} />
            <Title order={3}>{m.deviceSettings.title}</Title>
            <Text c="dimmed" size="sm" ta="center">
              {m.deviceSettings.notRegisteredText}
            </Text>
            <Button onClick={clearLocalAndGoSetup} variant="default">
              {m.deviceSettings.clearAndSetup}
            </Button>
            <Button
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.replace("/setup")}
              variant="subtle"
            >
              {m.deviceSettings.back}
            </Button>
          </Stack>
        </Paper>
      </Center>
    );
  }

  // ── コード検証 ────────────────────────────────────────────────────────────
  const verify = async (code: string) => {
    setState({ phase: "gate", error: null, submitting: true });
    try {
      const res = await fetch("/api/kiosk/device-settings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => null)) as {
        state?: string;
        until?: string;
        ticket?: string;
        device?: DeviceInfo;
        workLocationOptions?: WorkLocationOption[];
      } | null;
      if (data?.state === "OK" && data.ticket && data.device) {
        setLocationDraft(
          data.device.defaultWorkLocationId != null
            ? String(data.device.defaultWorkLocationId)
            : null,
        );
        setEnforceDraft(data.device.enforceWorkLocation);
        setLocationNotice(null);
        setState({
          phase: "settings",
          ticket: data.ticket,
          device: data.device,
          workLocationOptions: data.workLocationOptions ?? [],
        });
      } else if (data?.state === "LOCKED") {
        setState({ phase: "locked", until: data.until ?? null });
      } else if (data?.state === "NO_DEVICE") {
        window.location.reload();
      } else {
        setState({
          phase: "gate",
          error: m.deviceSettings.codeIncorrect,
          submitting: false,
        });
      }
    } catch {
      setState({
        phase: "gate",
        error: m.deviceSettings.communicationFailedRetry,
        submitting: false,
      });
    }
  };

  const runReset = async (mode: "local" | "unlink") => {
    if (state.phase !== "settings") return;
    const ticket = state.ticket;
    setConfirmMode(null);
    setState({ phase: "resetting" });
    try {
      const res = await fetch("/api/kiosk/device-settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, mode }),
      });
      const data = (await res.json().catch(() => null)) as {
        state?: string;
      } | null;
      if (data?.state === "OK") {
        clearLocalAndGoSetup();
        return;
      }
      // チケット期限切れ等 — コード入力からやり直し
      setState({
        phase: "gate",
        error: m.deviceSettings.operationExpired,
        submitting: false,
      });
    } catch {
      setState({
        phase: "gate",
        error: m.deviceSettings.communicationFailedRetry,
        submitting: false,
      });
    }
  };

  // 既定作業場所の保存 — チケットを消費し、応答の新チケットへ差し替える
  const saveLocation = async () => {
    if (state.phase !== "settings") return;
    setLocationSaving(true);
    setLocationNotice(null);
    try {
      const res = await fetch("/api/kiosk/device-settings/work-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: state.ticket,
          workLocationId: locationDraft ? Number(locationDraft) : null,
          enforceWorkLocation: enforceDraft,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        state?: string;
        ticket?: string;
        defaultWorkLocationId?: number | null;
        defaultWorkLocationLabel?: string | null;
      } | null;
      setLocationSaving(false);
      if (data?.state === "OK" && data.ticket) {
        setLocationNotice({
          text: m.deviceSettings.locationSaved,
          kind: "success",
        });
        setState({
          ...state,
          ticket: data.ticket,
          device: {
            ...state.device,
            defaultWorkLocationId: data.defaultWorkLocationId ?? null,
            defaultWorkLocationLabel: data.defaultWorkLocationLabel ?? null,
            enforceWorkLocation: enforceDraft,
          },
        });
        return;
      }
      if (data?.state === "LOCATION_INVALID" && data.ticket) {
        setLocationNotice({
          text: m.deviceSettings.locationInvalid,
          kind: "error",
        });
        setState({ ...state, ticket: data.ticket });
        return;
      }
      // チケット期限切れ等 — コード入力からやり直し
      setState({
        phase: "gate",
        error: m.deviceSettings.operationExpired,
        submitting: false,
      });
    } catch {
      setLocationSaving(false);
      setLocationNotice({
        text: m.deviceSettings.communicationFailedRetry,
        kind: "error",
      });
    }
  };

  return (
    <Center p="md" style={{ flex: 1 }}>
      <Paper maw={560} p="xl" radius="md" w="100%" withBorder>
        {state.phase === "gate" && (
          <Stack gap="md">
            <PinKeypad
              maxLength={6}
              minLength={6}
              onSubmit={verify}
              submitting={state.submitting}
              subtitle={m.deviceSettings.gateSubtitle}
              title={m.deviceSettings.title}
            />
            {state.error && (
              <Text c="red" size="sm" ta="center">
                {state.error}
              </Text>
            )}
            <Center>
              <Button
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => router.back()}
                variant="subtle"
              >
                {m.deviceSettings.back}
              </Button>
            </Center>
          </Stack>
        )}

        {state.phase === "locked" && (
          <Stack align="center" gap="md">
            <Title order={3}>{m.deviceSettings.lockedTitle}</Title>
            <Alert color="red" w="100%">
              {m.deviceSettings.lockedAlertText}
              {state.until &&
                fillMessage(m.deviceSettings.lockedUntil, {
                  time: new Date(state.until).toLocaleTimeString("ja-JP"),
                })}
            </Alert>
            <Button onClick={() => router.back()} variant="default">
              {m.deviceSettings.back}
            </Button>
          </Stack>
        )}

        {state.phase === "resetting" && (
          <Center py="xl">
            <Text c="dimmed">{m.deviceSettings.executing}</Text>
          </Center>
        )}

        {state.phase === "settings" && (
          <Stack gap="md">
            <Group gap="sm">
              <IconLockOpen color="var(--mantine-color-teal-5)" size={24} />
              <Title order={3}>{m.deviceSettings.title}</Title>
            </Group>

            <Stack gap={6}>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.deviceNameLabel}
                </Text>
                <Text fw={600} size="sm">
                  {state.device.name ?? m.deviceSettings.notSet}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.statusLabel}
                </Text>
                <Badge variant="light">
                  {statusLabel(state.device.status, m)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.linkedAtLabel}
                </Text>
                <Text size="sm">
                  {state.device.linkedAt
                    ? new Date(state.device.linkedAt).toLocaleString("ja-JP")
                    : "—"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.deviceTokenExpiryLabel}
                </Text>
                <Text size="sm">
                  {state.device.deviceTokenExpiresAt
                    ? new Date(
                        state.device.deviceTokenExpiresAt,
                      ).toLocaleString("ja-JP")
                    : "—"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.attestationKeyLabel}
                </Text>
                <Text ff="monospace" size="xs">
                  {state.device.fingerprint
                    ? `${state.device.fingerprint.slice(0, 16)}…`
                    : m.deviceSettings.unbound}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.webVersionLabel}
                </Text>
                <Text ff="monospace" size="sm">
                  v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {m.deviceSettings.dedicatedAppLabel}
                </Text>
                <Text ff="monospace" size="sm">
                  {wrapperVersion
                    ? `v${wrapperVersion}`
                    : m.deviceSettings.unusedBrowser}
                </Text>
              </Group>
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Group gap="xs">
                <IconMapPin size={18} />
                <Text fw={600} size="sm">
                  {m.deviceSettings.defaultWorkLocationTitle}
                </Text>
              </Group>
              <Text c="dimmed" size="xs">
                {m.deviceSettings.defaultWorkLocationDesc}
              </Text>
              <Group align="flex-end" gap="xs" wrap="nowrap">
                <Select
                  clearable
                  data={state.workLocationOptions}
                  onChange={setLocationDraft}
                  placeholder={m.deviceSettings.machineAreaPlaceholder}
                  searchable
                  style={{ flex: 1 }}
                  value={locationDraft}
                />
                <Button
                  leftSection={<IconDeviceFloppy size={16} />}
                  loading={locationSaving}
                  onClick={saveLocation}
                  variant="light"
                >
                  {m.deviceSettings.save}
                </Button>
              </Group>
              <Switch
                checked={enforceDraft}
                description={m.deviceSettings.enforceDescription}
                label={m.deviceSettings.enforceLabel}
                onChange={(e) => setEnforceDraft(e.currentTarget.checked)}
              />
              {locationNotice && (
                <Text
                  c={locationNotice.kind === "success" ? "teal" : "red"}
                  size="xs"
                >
                  {locationNotice.text}
                </Text>
              )}
            </Stack>

            <Divider />

            {confirmMode === null && (
              <Stack gap="sm">
                <Button
                  color="orange"
                  leftSection={<IconRefresh size={18} />}
                  onClick={() => setConfirmMode("unlink")}
                  size="lg"
                  variant="light"
                >
                  {m.deviceSettings.relinkButton}
                </Button>
                <Text c="dimmed" size="xs">
                  {m.deviceSettings.relinkDescription}
                </Text>
                <Button
                  color="red"
                  leftSection={<IconTrash size={18} />}
                  onClick={() => setConfirmMode("local")}
                  size="lg"
                  variant="outline"
                >
                  {m.deviceSettings.localResetButton}
                </Button>
                <Text c="dimmed" size="xs">
                  {m.deviceSettings.localResetDescription}
                </Text>
                <Button
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={() => router.back()}
                  variant="subtle"
                >
                  {m.deviceSettings.back}
                </Button>
              </Stack>
            )}

            {confirmMode !== null && (
              <Stack gap="sm">
                <Alert
                  color={confirmMode === "unlink" ? "orange" : "red"}
                  title={
                    confirmMode === "unlink"
                      ? m.deviceSettings.relinkConfirmTitle
                      : m.deviceSettings.localResetConfirmTitle
                  }
                >
                  {confirmMode === "unlink"
                    ? m.deviceSettings.relinkConfirmBody
                    : m.deviceSettings.localResetConfirmBody}{" "}
                  {m.deviceSettings.cannotUndo}
                </Alert>
                <Group grow>
                  <Button
                    onClick={() => setConfirmMode(null)}
                    variant="default"
                  >
                    {m.deviceSettings.cancel}
                  </Button>
                  <Button
                    color={confirmMode === "unlink" ? "orange" : "red"}
                    onClick={() => runReset(confirmMode)}
                  >
                    {m.deviceSettings.execute}
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        )}
      </Paper>
    </Center>
  );
}
