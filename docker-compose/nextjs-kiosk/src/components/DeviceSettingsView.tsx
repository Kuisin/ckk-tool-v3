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
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLockOpen,
  IconRefresh,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PinKeypad } from "@/components/PinKeypad";
import { getWrapperVersion } from "@/lib/wrapper-bridge";

type DeviceInfo = {
  id: string;
  name: string | null;
  status: "PENDING" | "LINKED" | "ACTIVE" | "DISABLED" | "REVOKED";
  linkedAt: string | null;
  deviceTokenExpiresAt: string | null;
  fingerprint: string | null;
};

type Phase =
  | { phase: "gate"; error: string | null; submitting: boolean }
  | { phase: "locked"; until: string | null }
  | { phase: "settings"; ticket: string; device: DeviceInfo }
  | { phase: "resetting" };

const STATUS_LABEL: Record<DeviceInfo["status"], string> = {
  PENDING: "リンク待ち",
  LINKED: "有効化待ち",
  ACTIVE: "有効",
  DISABLED: "無効化中",
  REVOKED: "取り消し済み",
};

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
  const [state, setState] = useState<Phase>({
    phase: "gate",
    error: null,
    submitting: false,
  });
  // 専用アプリ（ラッパー）のバージョン — マウント後にブリッジから取得
  const [wrapperVersion, setWrapperVersion] = useState<string | null>(null);
  useEffect(() => {
    setWrapperVersion(getWrapperVersion());
  }, []);
  const [confirmMode, setConfirmMode] = useState<"local" | "unlink" | null>(
    null,
  );

  // ── 端末 Cookie なし: ローカル消去のみ ────────────────────────────────────
  if (!hasDevice) {
    return (
      <Center p="md" style={{ flex: 1 }}>
        <Paper maw={480} p="xl" radius="md" w="100%" withBorder>
          <Stack align="center" gap="md">
            <IconSettings color="var(--mantine-color-gray-5)" size={48} />
            <Title order={3}>端末設定</Title>
            <Text c="dimmed" size="sm" ta="center">
              この端末は未登録です（端末情報がありません）。
              初期設定をやり直す場合はローカル情報を消去してください。
            </Text>
            <Button onClick={clearLocalAndGoSetup} variant="default">
              ローカル情報を消去して初期設定へ
            </Button>
            <Button
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.replace("/setup")}
              variant="subtle"
            >
              戻る
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
      } | null;
      if (data?.state === "OK" && data.ticket && data.device) {
        setState({
          phase: "settings",
          ticket: data.ticket,
          device: data.device,
        });
      } else if (data?.state === "LOCKED") {
        setState({ phase: "locked", until: data.until ?? null });
      } else if (data?.state === "NO_DEVICE") {
        window.location.reload();
      } else {
        setState({
          phase: "gate",
          error: "コードが違います",
          submitting: false,
        });
      }
    } catch {
      setState({
        phase: "gate",
        error: "通信に失敗しました。もう一度お試しください",
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
        error: "操作の有効期限が切れました。コードを再入力してください",
        submitting: false,
      });
    } catch {
      setState({
        phase: "gate",
        error: "通信に失敗しました。もう一度お試しください",
        submitting: false,
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
              subtitle="この端末の設定コード（6桁）を入力してください。コードは管理者が端末管理（SY09）で確認できます。"
              title="端末設定"
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
                戻る
              </Button>
            </Center>
          </Stack>
        )}

        {state.phase === "locked" && (
          <Stack align="center" gap="md">
            <Title order={3}>ロック中</Title>
            <Alert color="red" w="100%">
              コードの入力に連続で失敗したため、一時的にロックされています。
              {state.until &&
                ` 解除予定: ${new Date(state.until).toLocaleTimeString("ja-JP")}`}
            </Alert>
            <Button onClick={() => router.back()} variant="default">
              戻る
            </Button>
          </Stack>
        )}

        {state.phase === "resetting" && (
          <Center py="xl">
            <Text c="dimmed">実行中...</Text>
          </Center>
        )}

        {state.phase === "settings" && (
          <Stack gap="md">
            <Group gap="sm">
              <IconLockOpen color="var(--mantine-color-teal-5)" size={24} />
              <Title order={3}>端末設定</Title>
            </Group>

            <Stack gap={6}>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  端末名
                </Text>
                <Text fw={600} size="sm">
                  {state.device.name ?? "（未設定）"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  状態
                </Text>
                <Badge variant="light">
                  {STATUS_LABEL[state.device.status]}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  リンク日時
                </Text>
                <Text size="sm">
                  {state.device.linkedAt
                    ? new Date(state.device.linkedAt).toLocaleString("ja-JP")
                    : "—"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  端末トークン期限
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
                  アテステーション鍵
                </Text>
                <Text ff="monospace" size="xs">
                  {state.device.fingerprint
                    ? `${state.device.fingerprint.slice(0, 16)}…`
                    : "未束縛"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  Web バージョン
                </Text>
                <Text ff="monospace" size="sm">
                  v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  専用アプリ
                </Text>
                <Text ff="monospace" size="sm">
                  {wrapperVersion ? `v${wrapperVersion}` : "未使用（ブラウザ）"}
                </Text>
              </Group>
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
                  再リンク（リンク解除して初期設定へ）
                </Button>
                <Text c="dimmed" size="xs">
                  プロファイルをオープン（リンク待ち）に戻し、この端末の
                  トークン・鍵・セッションを破棄します。端末の交換・再リンクは
                  こちらを使用してください。
                </Text>
                <Button
                  color="red"
                  leftSection={<IconTrash size={18} />}
                  onClick={() => setConfirmMode("local")}
                  size="lg"
                  variant="outline"
                >
                  ローカルリセット（この端末の情報のみ消去）
                </Button>
                <Text c="dimmed" size="xs">
                  この端末の Cookie
                  等だけを消去します。プロファイルはリンク済みの
                  まま残るため、再リンクには管理者による SY09
                  の「リンク解除」が必要です。
                </Text>
                <Button
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={() => router.back()}
                  variant="subtle"
                >
                  戻る
                </Button>
              </Stack>
            )}

            {confirmMode !== null && (
              <Stack gap="sm">
                <Alert
                  color={confirmMode === "unlink" ? "orange" : "red"}
                  title={
                    confirmMode === "unlink"
                      ? "再リンクの確認"
                      : "ローカルリセットの確認"
                  }
                >
                  {confirmMode === "unlink"
                    ? "この端末のリンクを解除して初期設定画面に戻します。再度使用するには管理者による再リンクと有効化が必要です。"
                    : "この端末のローカル情報のみ消去します。プロファイルはリンク済みのまま残るため、この端末を再登録するには管理者による「リンク解除」が必要です。"}
                  この操作は取り消せません。
                </Alert>
                <Group grow>
                  <Button
                    onClick={() => setConfirmMode(null)}
                    variant="default"
                  >
                    キャンセル
                  </Button>
                  <Button
                    color={confirmMode === "unlink" ? "orange" : "red"}
                    onClick={() => runReset(confirmMode)}
                  >
                    実行
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
