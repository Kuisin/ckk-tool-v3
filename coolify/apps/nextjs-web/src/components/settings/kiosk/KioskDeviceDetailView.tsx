"use client";

/**
 * KioskDeviceDetailView — 端末詳細（SY09, /settings/kiosk-devices/[id]）。
 *
 * サマリ（状態・拠点・場所・リンク/有効化・アテスト鍵）+ ライブのオンライン/
 * 利用者表示（useKioskPresence — 一覧と同じ解決規則）+ 最近の利用者
 * （LOGIN ログの集計）+ 利用履歴（DeviceLogList — モーダルと共用）。
 */

import {
  Anchor,
  Badge,
  Flex,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconEye,
  IconHistory,
  IconMapPin,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  type DeviceUnlockPinInfo,
  listUnlockPinHistory,
  regenerateSettingsCode,
  revealDeviceUnlockPin,
  revealKioskPin,
  type UnlockPinHistoryRow,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { LoginAttemptList } from "@/components/settings/security/LoginAttemptList";
import { OwnershipBadge } from "@/components/settings/security/ownership";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { KioskDeviceRecentUser, KioskDeviceRow } from "@/lib/kiosk-admin";
import type { LoginAttemptRow } from "@/lib/login-attempts";
import { DeviceProfilePanel } from "./DeviceProfilePanel";
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
  authFailures,
}: {
  device: KioskDeviceRow;
  recentUsers: KioskDeviceRecentUser[];
  /** この端末で弾かれた認証（直近 90 日・最大 30 件）。 */
  authFailures: LoginAttemptRow[];
}) {
  const fmt = useFormat();
  const { presence, live, transport } = useKioskPresence();
  const [isPending, startTransition] = useTransition();
  /**
   * いま走っている操作。`isPending` は useTransition ひとつ分の状態なので、
   * これだけでボタンを光らせると**押していないボタンまで一緒に loading になる**
   * （SY09 で実際にそうなっていた）。押されたものだけを光らせるための識別子。
   */
  const [busy, setBusy] = useState<
    "unlock" | "settings" | "history" | "held" | "regen" | null
  >(null);
  /** そのボタンが押されて実行中か。 */
  const loadingOf = (kind: NonNullable<typeof busy>) =>
    isPending && busy === kind;
  /** 実行中は他のボタンを押させない（多重送信と表示の取り違えを防ぐ）。 */
  const otherBusy = (kind: NonNullable<typeof busy>) =>
    isPending && busy !== null && busy !== kind;
  // PIN 開示（表示前に確認 → サーバーで監査ログ記録 → 60 秒後に自動で隠す）
  const [confirmKind, setConfirmKind] = useState<"unlock" | "settings" | null>(
    null,
  );
  const [revealed, setRevealed] = useState<{
    unlock?: string;
    settings?: string;
  }>({});
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );
  const scheduleHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setRevealed({}), 60_000);
  };
  const reveal = (kind: "unlock" | "settings") => {
    setBusy(kind);
    startTransition(async () => {
      try {
        const result = await revealKioskPin({ kind, deviceId: device.id });
        if (result.ok) {
          setRevealed((r) => ({ ...r, [kind]: result.data.value }));
          scheduleHide();
        } else {
          notifications.show({
            title: "エラー",
            message: result.error,
            color: "red",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };
  // PIN 履歴（オフライン端末を開けるとき用 — 現行値ではなく「最後に同期できた
  // 時点の値」が要る）。開示と同じく確認 → 監査ログ記録 → 60 秒で自動的に閉じる。
  const [confirmHistory, setConfirmHistory] = useState(false);
  const [history, setHistory] = useState<UnlockPinHistoryRow[] | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    },
    [],
  );
  const openHistory = () => {
    setBusy("history");
    startTransition(async () => {
      try {
        const result = await listUnlockPinHistory();
        if (result.ok) {
          setHistory(result.data.rows);
          if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
          historyTimerRef.current = setTimeout(() => setHistory(null), 60_000);
        } else {
          notifications.show({
            title: "エラー",
            message: result.error,
            color: "red",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };
  // この端末が保持している PIN（受け渡しの記録から引く）。同じく 60 秒で隠す。
  const [confirmHeld, setConfirmHeld] = useState(false);
  const [held, setHeld] = useState<DeviceUnlockPinInfo | null>(null);
  const heldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (heldTimerRef.current) clearTimeout(heldTimerRef.current);
    },
    [],
  );
  const revealHeld = () => {
    setBusy("held");
    startTransition(async () => {
      try {
        const result = await revealDeviceUnlockPin(device.id);
        if (result.ok) {
          setHeld(result.data);
          if (heldTimerRef.current) clearTimeout(heldTimerRef.current);
          heldTimerRef.current = setTimeout(() => setHeld(null), 60_000);
        } else {
          notifications.show({
            title: "エラー",
            message: result.error,
            color: "red",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };
  const [confirmRegen, setConfirmRegen] = useState(false);
  const regenerate = () => {
    setBusy("regen");
    startTransition(async () => {
      try {
        const result = await regenerateSettingsCode(device.id);
        if (result.ok) {
          setRevealed((r) => ({ ...r, settings: result.data.code }));
          scheduleHide();
          notifications.show({
            title: "再生成しました",
            message: "新しい設定コードを表示しています",
            color: "green",
          });
        } else {
          notifications.show({
            title: "エラー",
            message: result.error,
            color: "red",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };
  const online = resolveOnline(device, presence, live);
  const currentUser = resolveCurrentUserName(device, presence, live);
  const liveActivity = live
    ? (presence.get(device.id)?.lastActivityAt ?? device.lastActivityAt)
    : device.lastActivityAt;
  // PIN 履歴の照合用（この端末が最後に通信できた時刻）
  const lastSeenMs = liveActivity ? Date.parse(liveActivity) : null;

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
            value={liveActivity ? fmt.dateTime(liveActivity) : "—"}
          />
          <FieldValue label="拠点" value={device.plantLabel ?? "—"} />
          <FieldValue label="場所" value={device.location ?? "—"} />
          <FieldValue
            label="リンク日時"
            value={device.linkedAt ? fmt.dateTime(device.linkedAt) : "—"}
          />
          <FieldValue
            label="有効化"
            value={
              device.activatedAt
                ? `${fmt.dateTime(device.activatedAt)}${
                    device.activatedByName
                      ? `（${device.activatedByName}）`
                      : ""
                  }`
                : "—"
            }
          />
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
            label="作成日時"
            value={device.createdAt ? fmt.dateTime(device.createdAt) : "—"}
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
                    {fmt.dateTime(device.latestLocation.recordedAt)} 時点
                  </Text>
                </Stack>
              ) : (
                "未取得"
              )
            }
          />
        </SimpleGrid>
      </Paper>

      {/* PIN・設定コード（表示前に確認 → 監査ログ記録。60 秒で自動非表示） */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          PIN・設定コード
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              メンテナンス PIN（全端末共通・毎日 4:00 自動更新）
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Text ff="monospace" fw={700} size="lg">
                {revealed.unlock ?? "••••••"}
              </Text>
              {!revealed.unlock && (
                <SecondaryButton
                  disabled={otherBusy("unlock")}
                  leftSection={<IconEye size={14} />}
                  loading={loadingOf("unlock")}
                  onClick={() => setConfirmKind("unlock")}
                  size="xs"
                >
                  表示
                </SecondaryButton>
              )}
              <SecondaryButton
                disabled={otherBusy("history")}
                leftSection={<IconHistory size={14} />}
                loading={loadingOf("history")}
                onClick={() => setConfirmHistory(true)}
                size="xs"
              >
                履歴
              </SecondaryButton>
            </Group>
            <Text c="dimmed" size="xs">
              端末画面の右上 5 タップ → この PIN でキオスクロックを一時解除
              （Wi-Fi 変更等）
            </Text>
            <Text c="dimmed" size="xs">
              オフラインの端末は PIN を同期できないため、
              <b>最後に受け取れた時点の PIN</b>
              しか受け付けない。開けたいときは右の「この端末が保持している
              PIN」を使う
            </Text>
          </Stack>

          {/* 端末が実際に受け取れた PIN（推測ではなく受け渡しの記録から引く） */}
          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              この端末が保持している PIN
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Text ff="monospace" fw={700} size="lg">
                {held ? (held.pin ?? "—") : "••••••"}
              </Text>
              {!held && device.unlockPinSyncedAt && (
                <SecondaryButton
                  disabled={otherBusy("held")}
                  leftSection={<IconEye size={14} />}
                  loading={loadingOf("held")}
                  onClick={() => setConfirmHeld(true)}
                  size="xs"
                >
                  表示
                </SecondaryButton>
              )}
              {held?.isCurrent && (
                <Badge color="green" size="xs" variant="light">
                  最新
                </Badge>
              )}
            </Group>
            {device.unlockPinSyncedAt ? (
              <Text c="dimmed" size="xs">
                最終同期 {fmt.dateTime(device.unlockPinSyncedAt)}
                {held && !held.pin ? "（当時の PIN は履歴に残っていない）" : ""}
              </Text>
            ) : (
              <Text c="orange" size="xs">
                <b>未同期</b> — この端末はまだ一度も PIN
                を受け取っていない。端末はビルド時の既定 PIN（APK
                のビルド設定にのみ存在。サーバーには無い）のまま
              </Text>
            )}
            <Text c="dimmed" size="xs">
              受け取れたときだけ記録する。通信できていても未リンク・トークン切れ
              （401）や PinSync 以前の APK では届いていない
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              端末設定コード（この端末・左上 5 タップ用）
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Text ff="monospace" fw={700} size="lg">
                {revealed.settings ?? "••••••"}
              </Text>
              {!revealed.settings && (
                <SecondaryButton
                  disabled={otherBusy("settings")}
                  leftSection={<IconEye size={14} />}
                  loading={loadingOf("settings")}
                  onClick={() => setConfirmKind("settings")}
                  size="xs"
                >
                  表示
                </SecondaryButton>
              )}
              <SecondaryButton
                disabled={otherBusy("regen")}
                leftSection={<IconRefresh size={14} />}
                loading={loadingOf("regen")}
                onClick={() => setConfirmRegen(true)}
                size="xs"
              >
                再生成
              </SecondaryButton>
            </Group>
            <Text c="dimmed" size="xs">
              端末リセット・再リンク用の解錠コード。フロア担当者に伝えて使用
            </Text>
          </Stack>
        </SimpleGrid>
      </Paper>

      {/* 端末情報（所有区分・判定根拠・署名済みプロファイル） */}
      <DeviceProfilePanel device={device} />

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
                      <UserAvatar
                        initials={u.displayName.slice(0, 1)}
                        name={u.displayName}
                        size="sm"
                      />
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
                        {fmt.dateTime(u.lastLoginAt)}
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

      {/* 認証エラー — 利用履歴（成功したログインとプレゼンス）では見えない分 */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          認証エラー（直近 90 日）
        </Title>
        <LoginAttemptList
          emptyMessage="この端末で弾かれた認証はありません"
          rows={authFailures}
          showOwnership={false}
        />
      </Paper>
      {/* PIN 表示・再生成の確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="表示"
        loading={isPending}
        message="PIN を表示します。表示した操作は監査ログに記録されます。"
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind) reveal(confirmKind);
          setConfirmKind(null);
        }}
        opened={confirmKind != null}
        title="PIN の表示"
      />
      <ConfirmModal
        confirmLabel="再生成"
        loading={isPending}
        message="端末設定コードを再生成します。以前のコードは使えなくなります。"
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => {
          regenerate();
          setConfirmRegen(false);
        }}
        opened={confirmRegen}
        title="設定コードの再生成"
      />
      {/* 端末が保持している PIN の表示確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="表示"
        loading={isPending}
        message="この端末に最後に渡したメンテナンス PIN を表示します。表示した操作は監査ログに記録されます。"
        onClose={() => setConfirmHeld(false)}
        onConfirm={() => {
          revealHeld();
          setConfirmHeld(false);
        }}
        opened={confirmHeld}
        title="端末が保持している PIN の表示"
      />
      {/* PIN 履歴の表示確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="表示"
        loading={isPending}
        message="過去のメンテナンス PIN を表示します。表示した操作は監査ログに記録されます。"
        onClose={() => setConfirmHistory(false)}
        onConfirm={() => {
          openHistory();
          setConfirmHistory(false);
        }}
        opened={confirmHistory}
        title="PIN 履歴の表示"
      />
      <ModalShell
        hideFooter
        onClose={() => setHistory(null)}
        opened={history != null}
        size="lg"
        title="メンテナンス PIN の履歴"
      >
        <Text c="dimmed" size="xs">
          オフラインの端末が受け付けるのは「最後に通信できた時点の PIN」。
          この端末の最終通信は
          {liveActivity ? ` ${fmt.dateTime(liveActivity)}` : "（記録なし）"}
          {liveActivity ? " — その時刻を含む行を使う" : ""}。
        </Text>
        {history?.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={20} />}
            message="履歴がまだありません（次の自動更新から記録されます）"
          />
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Table highlightOnHover striped={false}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>PIN</Table.Th>
                  <Table.Th>有効になった時刻</Table.Th>
                  <Table.Th>置き換わった時刻</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(history ?? []).map((row) => {
                  // この端末が最後に通信できた時刻に有効だった行 = その端末が
                  // 今も保持している PIN
                  const activeThen =
                    lastSeenMs != null &&
                    Date.parse(row.rotatedAt) <= lastSeenMs &&
                    (row.supersededAt == null ||
                      lastSeenMs < Date.parse(row.supersededAt));
                  return (
                    <Table.Tr key={row.rotatedAt}>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Text ff="monospace" fw={700}>
                            {row.pin}
                          </Text>
                          {row.supersededAt == null && (
                            <Badge color="blue" size="xs" variant="light">
                              現在
                            </Badge>
                          )}
                          {activeThen && (
                            <Badge color="green" size="xs" variant="light">
                              最終通信時
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{fmt.dateTime(row.rotatedAt)}</Table.Td>
                      <Table.Td>
                        {row.supersededAt
                          ? fmt.dateTime(row.supersededAt)
                          : "—"}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </ModalShell>
    </Stack>
  );
}
