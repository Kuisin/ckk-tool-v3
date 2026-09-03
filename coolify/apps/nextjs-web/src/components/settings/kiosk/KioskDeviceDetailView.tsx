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
  Tabs,
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
import { useTranslations } from "next-intl";
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
import { AppTabs } from "@/components/ui/AppTabs";
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
  const tr = useTranslations();
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
            title: tr("common.error2"),
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
            title: tr("common.error2"),
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
            title: tr("common.error2"),
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
            title: tr("common.regenerated"),
            message: tr("settings.kiosk.showingTheNewSettingsCode"),
            color: "green",
          });
        } else {
          notifications.show({
            title: tr("common.error2"),
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
            {tr("common.backToTheList")}
          </SecondaryButton>
        }
        breadcrumbs={[
          tr("common.system"),
          tr("common.devices"),
          device.name ?? tr("settings.kiosk.deviceDetails"),
        ]}
        status={<StatusBadge entity="KioskDevice" status={device.status} />}
        title={device.name ?? tr("common.unnamed")}
      />

      {/* サマリ */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label={tr("common.online")}
            value={
              device.status === "ACTIVE" ? (
                <Tooltip label={transportLabel(tr, transport)} withinPortal>
                  <span>
                    <OnlineDot online={online} />
                  </span>
                </Tooltip>
              ) : (
                "—"
              )
            }
          />
          <FieldValue label={tr("common.user2")} value={currentUser ?? "—"} />
          <FieldValue
            label={tr("common.lastActivity")}
            value={liveActivity ? fmt.dateTime(liveActivity) : "—"}
          />
          <FieldValue
            label={tr("common.site")}
            value={device.plantLabel ?? "—"}
          />
          <FieldValue
            label={tr("common.location2")}
            value={device.location ?? "—"}
          />
          <FieldValue
            label={tr("settings.kiosk.linkedAt")}
            value={device.linkedAt ? fmt.dateTime(device.linkedAt) : "—"}
          />
          <FieldValue
            label={tr("common.enable")}
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
            label={tr("common.deviceType")}
            value={
              <OwnershipBadge
                size="sm"
                source={device.ownershipSource}
                value={device.ownership}
              />
            }
          />
          <FieldValue
            label={tr("common.created2")}
            value={device.createdAt ? fmt.dateTime(device.createdAt) : "—"}
          />
          <FieldValue
            label={tr("settings.kiosk.gPSPositionLatest")}
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
                    {tr("settings.kioskDeviceDetailView.asOfLabel", {
                      date: fmt.dateTime(device.latestLocation.recordedAt),
                    })}
                  </Text>
                </Stack>
              ) : (
                tr("settings.kiosk.notFetched")
              )
            }
          />
        </SimpleGrid>
      </Paper>

      {/* タブ（design.md §8.2 — 詳細画面はサマリ + Tabs）。ディスプレイの
          詳細と同じ構成にしてある。**パネルの中に Paper を置かない** —
          パネル自体が中身の領域なので、置くとカードが入れ子になる。
          見出しもタブ名と重複するので出さない。 */}
      <AppTabs defaultValue="secrets">
        <Tabs.List>
          <Tabs.Tab value="secrets">
            {tr("settings.kiosk.pINAndSettingsCode")}
          </Tabs.Tab>
          <Tabs.Tab value="device">{tr("common.deviceInformation")}</Tabs.Tab>
          <Tabs.Tab value="usage">{tr("settings.kiosk.usage")}</Tabs.Tab>
          <Tabs.Tab value="errors">
            {tr("settings.kiosk.authenticationError")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="secrets">
          {/* PIN・設定コード（表示前に確認 → 監査ログ記録。60 秒で自動非表示） */}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Stack gap={4}>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.maintenancePinSameOnEveryDevice")}
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
                    {tr("common.display")}
                  </SecondaryButton>
                )}
                <SecondaryButton
                  disabled={otherBusy("history")}
                  leftSection={<IconHistory size={14} />}
                  loading={loadingOf("history")}
                  onClick={() => setConfirmHistory(true)}
                  size="xs"
                >
                  {tr("common.history")}
                </SecondaryButton>
              </Group>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.fiveTapsTopRightOnThe")}
              </Text>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.anOfflineDeviceCannotSyncThe")}
                <b>{tr("settings.kiosk.thePinAsOfTheLast")}</b>
                {tr("settings.kiosk.isTheOnlyOneItAccepts")}
              </Text>
            </Stack>

            {/* 端末が実際に受け取れた PIN（推測ではなく受け渡しの記録から引く） */}
            <Stack gap={4}>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.thePinThisDeviceIsHolding")}
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
                    {tr("common.display")}
                  </SecondaryButton>
                )}
                {held?.isCurrent && (
                  <Badge color="green" size="xs" variant="light">
                    {tr("common.latest")}
                  </Badge>
                )}
              </Group>
              {device.unlockPinSyncedAt ? (
                <Text c="dimmed" size="xs">
                  {tr("settings.kioskDeviceDetailView.lastSyncedLabel", {
                    date: fmt.dateTime(device.unlockPinSyncedAt),
                  })}
                  {held && !held.pin
                    ? tr("settings.kiosk.thePinAtThatTimeIs")
                    : ""}
                </Text>
              ) : (
                <Text c="orange" size="xs">
                  <b>{tr("settings.kiosk.notSynced")}</b>{" "}
                  {tr("settings.kiosk.thisDeviceHasNeverReceivedA")}
                </Text>
              )}
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.recordedOnlyWhenItWasActually")}
              </Text>
            </Stack>

            <Stack gap={4}>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.deviceSettingsCodeForThisDevice")}
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
                    {tr("common.display")}
                  </SecondaryButton>
                )}
                <SecondaryButton
                  disabled={otherBusy("regen")}
                  leftSection={<IconRefresh size={14} />}
                  loading={loadingOf("regen")}
                  onClick={() => setConfirmRegen(true)}
                  size="xs"
                >
                  {tr("common.regenerate")}
                </SecondaryButton>
              </Group>
              <Text c="dimmed" size="xs">
                {tr("settings.kiosk.theUnlockCodeForResettingOr")}
              </Text>
            </Stack>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="device">
          <DeviceProfilePanel device={device} />
        </Tabs.Panel>

        {/* 利用履歴はページングで自分で引くので、開くまで動かさない。
            この中の 2 枚（最近の利用者 / 利用履歴）は**並べて見せる別の表**
            なので Paper を残す — 入れ子ではなく横並びの 1 段。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="usage">
          <Flex
            align="stretch"
            direction={{ base: "column", md: "row" }}
            gap="md"
          >
            {/* 最近の利用者（LOGIN ログの集計） */}
            <Flex direction="column" style={{ flex: 5, minWidth: 0 }}>
              <Paper h="100%" p="md" radius="md" withBorder>
                <Title mb="sm" order={5}>
                  {tr("settings.kiosk.recentUsers")}
                </Title>
                {recentUsers.length === 0 ? (
                  <EmptyState
                    icon={<IconUsers size={28} />}
                    message={tr("settings.kiosk.itHasNotBeenUsedOn")}
                  />
                ) : (
                  <Stack gap="xs">
                    {recentUsers.map((u) => (
                      <Group
                        justify="space-between"
                        key={u.userId}
                        wrap="nowrap"
                      >
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
                            {tr("settings.kiosk.useCountTimes", {
                              count: u.loginCount,
                            })}
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
                  {tr("common.usageHistory")}
                </Title>
                <DeviceLogList deviceId={device.id} />
              </Paper>
            </Flex>
          </Flex>
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="errors">
          {/* 認証エラー — 利用履歴（成功したログインとプレゼンス）では見えない分 */}
          <LoginAttemptList
            emptyMessage={tr(
              "settings.kiosk.noAuthenticationWasRejectedOnThis",
            )}
            rows={authFailures}
            showOwnership={false}
          />
        </Tabs.Panel>
      </AppTabs>

      {/* PIN 表示・再生成の確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("common.display")}
        loading={isPending}
        message={tr("settings.kiosk.showsThePinDoingSoIs")}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind) reveal(confirmKind);
          setConfirmKind(null);
        }}
        opened={confirmKind != null}
        title={tr("settings.kiosk.showThePin")}
      />
      <ConfirmModal
        confirmLabel={tr("common.regenerate")}
        loading={isPending}
        message={tr("settings.kiosk.regeneratesTheDeviceSettingsCodeThe")}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => {
          regenerate();
          setConfirmRegen(false);
        }}
        opened={confirmRegen}
        title={tr("settings.kiosk.regenerateTheSettingsCode")}
      />
      {/* 端末が保持している PIN の表示確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("common.display")}
        loading={isPending}
        message={tr("settings.kiosk.showsTheMaintenancePinLastHanded")}
        onClose={() => setConfirmHeld(false)}
        onConfirm={() => {
          revealHeld();
          setConfirmHeld(false);
        }}
        opened={confirmHeld}
        title={tr("settings.kiosk.revealThePinADeviceHolds")}
      />
      {/* PIN 履歴の表示確認 */}
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("common.display")}
        loading={isPending}
        message={tr("settings.kiosk.showsPastMaintenancePinsDoingSo")}
        onClose={() => setConfirmHistory(false)}
        onConfirm={() => {
          openHistory();
          setConfirmHistory(false);
        }}
        opened={confirmHistory}
        title={tr("settings.kiosk.revealPinHistory")}
      />
      <ModalShell
        hideFooter
        onClose={() => setHistory(null)}
        opened={history != null}
        size="lg"
        title={tr("settings.kiosk.maintenancePinHistory")}
      >
        <Text c="dimmed" size="xs">
          {tr("settings.kioskDeviceDetailView.offlineAcceptsLastSyncedPin")}
          {liveActivity
            ? ` ${fmt.dateTime(liveActivity)}`
            : tr("settings.kiosk.noRecord")}
          {liveActivity
            ? tr("settings.kioskDeviceDetailView.usesRowIncludingThatTime")
            : "。"}
        </Text>
        {history?.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={20} />}
            message={tr("settings.kiosk.thereIsNoHistoryYetRecording")}
          />
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Table highlightOnHover striped={false}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>PIN</Table.Th>
                  <Table.Th>{tr("settings.kiosk.tookEffectAt")}</Table.Th>
                  <Table.Th>{tr("settings.kiosk.replacedAt")}</Table.Th>
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
                              {tr("settings.kiosk.now")}
                            </Badge>
                          )}
                          {activeThen && (
                            <Badge color="green" size="xs" variant="light">
                              {tr("settings.kiosk.lastCommunication")}
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
