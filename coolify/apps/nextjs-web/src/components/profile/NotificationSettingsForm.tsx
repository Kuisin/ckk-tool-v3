"use client";

/**
 * NotificationSettingsForm — 通知チャネル設定 + Web Push（デバイス別）。
 *
 * - メール / プッシュの ON/OFF（user_notification_settings へ upsert）
 * - 「このデバイスで有効化」: SW 登録 → 通知許可 → PushManager 購読 →
 *   Server Action で push_subscriptions へ保存（VAPID 公開鍵はサーバーから
 *   props で受け取る — ランタイム env で動くよう NEXT_PUBLIC インライン化に
 *   依存しない）
 * - プラットフォーム別の案内:
 *     Chrome（デスクトップ / Android） … そのまま有効化可。`beforeinstallprompt`
 *       を捕捉できた場合は「アプリをインストール」も出す（任意）。
 *     iOS / iPadOS … Safari のタブでは Push API 自体が無効。共有 →
 *       「ホーム画面に追加」した PWA から有効化する（iOS 16.4 以降）。
 *     通知がブロック済み（denied）… ブラウザ設定での解除手順を案内。
 * - 登録デバイス一覧: 本人の push_subscriptions を表示・削除（他デバイス含む）。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  List,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBellRinging,
  IconDeviceMobile,
  IconDownload,
  IconInfoCircle,
  IconShare2,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscriptionAction,
  saveNotificationSettingAction,
  savePushSubscriptionAction,
} from "@/components/layout/notification-actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  PrimaryButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";

interface ChannelSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/** 登録済みデバイス（本人の push_subscriptions 行）。 */
export interface PushDevice {
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

/** `beforeinstallprompt`（Chrome / Edge / Android のみ発火）の最小型。 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** base64url → Uint8Array（PushManager.subscribe の applicationServerKey 用）。 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(
    (base64 + padding).replaceAll("-", "+").replaceAll("_", "/"),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** UA 文字列 → 「Chrome / Android」のような短いデバイスラベル。 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "不明なデバイス";
  const ua = userAgent;
  const browser = /Edg(?:e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /CriOS\//.test(ua)
        ? "Chrome (iOS)"
        : /FxiOS\//.test(ua)
          ? "Firefox (iOS)"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "ブラウザ";
  const os = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} / ${os}` : browser;
}

export function NotificationSettingsForm({
  initial,
  mailerConfigured,
  pushConfigured,
  vapidPublicKey,
  devices,
}: {
  initial: ChannelSettings;
  mailerConfigured: boolean;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
  devices: PushDevice[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [pushSupported, setPushSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  // プラットフォーム状態（マウント後に検出 — SSR では不明）
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  // このデバイスの購読状態 + プラットフォームを確認
  useEffect(() => {
    // iPadOS 13+ は "Macintosh" を名乗るため maxTouchPoints で判定する
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
    if ("Notification" in window) setPermission(Notification.permission);
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushSupported(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(Boolean(sub));
        setCurrentEndpoint(sub?.endpoint ?? null);
      } catch {
        setSubscribed(false);
      }
    })();
  }, []);

  // Chrome / Edge / Android のインストールプロンプトを捕捉（未対応環境では発火しない）
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const save = () => {
    startTransition(async () => {
      const res = await saveNotificationSettingAction(settings);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr(
            "profile.notificationSettingsForm.theNotificationSettingsWereUpdated",
          ),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const enablePushOnDevice = async () => {
    if (!vapidPublicKey) return;
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        notifications.show({
          title: tr("profile.notificationSettingsForm.itWasNotAllowed"),
          message: tr(
            "profile.notificationSettingsForm.theBrowserSNotificationPermissionIs",
          ),
          color: "orange",
        });
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as unknown as BufferSource,
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (res.ok) {
        setSubscribed(true);
        setCurrentEndpoint(sub.endpoint);
        notifications.show({
          title: tr("common.enabled2"),
          message: tr(
            "profile.notificationSettingsForm.receivePushNotificationsOnThisDevice",
          ),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    } catch (e) {
      console.error("[push] subscribe failed:", e);
      notifications.show({
        title: tr("common.error2"),
        message:
          isIos && !isStandalone
            ? tr("profile.notificationSettingsForm.onIosItCanOnlyBe")
            : tr(
                "profile.notificationSettingsForm.couldNotEnablePushNotifications",
              ),
        color: "red",
      });
    } finally {
      setPushBusy(false);
    }
  };

  const disablePushOnDevice = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setCurrentEndpoint(null);
      notifications.show({
        title: tr("common.disabled2"),
        message: tr(
          "profile.notificationSettingsForm.pushNotificationsWereTurnedOffOn",
        ),
        color: "green",
      });
      router.refresh();
    } finally {
      setPushBusy(false);
    }
  };

  const removeDevice = (device: PushDevice) => {
    openConfirm({
      title: tr("profile.notificationSettingsForm.removeTheRegisteredDevice"),
      message: `「${deviceLabel(device.userAgent)}」へのプッシュ通知を停止します。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await removePushSubscriptionAction(device.endpoint);
          if (res.ok) {
            if (device.endpoint === currentEndpoint) {
              // 自デバイス分はブラウザ側の購読も解除しておく
              try {
                const reg = await navigator.serviceWorker.getRegistration();
                const sub = await reg?.pushManager.getSubscription();
                if (sub?.endpoint === device.endpoint) await sub.unsubscribe();
              } catch {
                // ignore
              }
              setSubscribed(false);
              setCurrentEndpoint(null);
            }
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: res.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  // iOS の Safari タブでは Push API 自体が出ない → ホーム画面追加の案内を出す
  const showIosGuide =
    isIos && !isStandalone && (!pushSupported || !subscribed);

  return (
    <Stack gap="md" maw={960} mx="auto" w="100%">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.profile"), href: "/profile" },
          { label: tr("common.notificationSettings") },
        ]}
        title={tr("common.notificationSettings")}
      />

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="md">
          <Text fw={600} size="sm">
            {tr("profile.notificationSettingsForm.notificationChannel")}
          </Text>
          <Switch
            checked={settings.emailEnabled}
            description={
              mailerConfigured
                ? tr(
                    "profile.notificationSettingsForm.receiveApprovalRequestsImportResultsAnd",
                  )
                : tr(
                    "profile.notificationSettingsForm.nothingIsSentWhileTheMail",
                  )
            }
            label={tr("profile.notificationSettingsForm.emailNotification")}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                emailEnabled: e.currentTarget.checked,
              }))
            }
          />
          <Switch
            checked={settings.pushEnabled}
            description={tr(
              "profile.notificationSettingsForm.sendPushNotificationsToTheEnabled",
            )}
            label={tr("profile.notificationSettingsForm.pushNotifications")}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                pushEnabled: e.currentTarget.checked,
              }))
            }
          />
          <div>
            <SaveButton loading={isPending} onClick={save} type="button" />
          </div>
        </Stack>
      </Paper>

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            {tr(
              "profile.notificationSettingsForm.pushNotificationsOnThisDevice",
            )}
          </Text>
          {!pushConfigured || !vapidPublicKey ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              {tr(
                "profile.notificationSettingsForm.pushNotificationsAreUnavailableBecauseThe",
              )}
            </Alert>
          ) : showIosGuide ? (
            <Alert
              color="blue"
              icon={<IconDeviceMobile size={16} />}
              title={tr(
                "profile.notificationSettingsForm.onIphoneAndIpadAddIt",
              )}
            >
              <List size="sm" spacing={4} type="ordered">
                <List.Item>
                  {tr(
                    "profile.notificationSettingsForm.openThisSiteInSafariAnd",
                  )}
                  <IconShare2 size={14} style={{ verticalAlign: "-2px" }} />
                  {tr("profile.notificationSettingsForm.toTap")}
                </List.Item>
                <List.Item>
                  {tr("profile.notificationSettingsForm.chooseAddToHomeScreen")}
                </List.Item>
                <List.Item>
                  {tr(
                    "profile.notificationSettingsForm.reopenItFromTheCkkIcon",
                  )}
                </List.Item>
              </List>
            </Alert>
          ) : !pushSupported ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              {tr(
                "profile.notificationSettingsForm.thisBrowserDoesNotSupportPush",
              )}
            </Alert>
          ) : permission === "denied" ? (
            <Alert
              color="orange"
              icon={<IconInfoCircle size={16} />}
              title={tr(
                "profile.notificationSettingsForm.notificationsAreBlocked",
              )}
            >
              {tr(
                "profile.notificationSettingsForm.allowNotificationsForThisSiteAgain",
              )}
            </Alert>
          ) : subscribed ? (
            <>
              <Text c="dimmed" size="xs">
                {tr(
                  "profile.notificationSettingsForm.thisDeviceIsRegisteredNotificationsReach",
                )}
              </Text>
              <div>
                <SecondaryButton
                  loading={pushBusy}
                  onClick={disablePushOnDevice}
                >
                  {tr("profile.notificationSettingsForm.disableOnThisDevice")}
                </SecondaryButton>
              </div>
            </>
          ) : (
            <>
              <Text c="dimmed" size="xs">
                {tr(
                  "profile.notificationSettingsForm.enablingItAsksForTheBrowser",
                )}
              </Text>
              <Group gap="sm">
                <PrimaryButton
                  leftSection={<IconBellRinging size={16} />}
                  loading={pushBusy}
                  onClick={enablePushOnDevice}
                >
                  {tr("profile.notificationSettingsForm.enableOnThisDevice")}
                </PrimaryButton>
                {installPrompt && (
                  <SecondaryButton
                    leftSection={<IconDownload size={16} />}
                    onClick={installApp}
                  >
                    {tr("profile.notificationSettingsForm.installTheApp")}
                  </SecondaryButton>
                )}
              </Group>
              {installPrompt && (
                <Text c="dimmed" size="xs">
                  {tr(
                    "profile.notificationSettingsForm.installingItLetsYouLaunchFrom",
                  )}
                </Text>
              )}
            </>
          )}
        </Stack>
      </Paper>

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            {tr("profile.notificationSettingsForm.registeredDevices")}
          </Text>
          {devices.length === 0 ? (
            <Text c="dimmed" size="sm">
              {tr(
                "profile.notificationSettingsForm.noDevicesAreRegisteredUseEnable",
              )}
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={420}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      {tr("profile.notificationSettingsForm.device")}
                    </Table.Th>
                    <Table.Th>{tr("common.registeredAt")}</Table.Th>
                    <Table.Th w={48} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {devices.map((d) => (
                    <Table.Tr key={d.endpoint}>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm">{deviceLabel(d.userAgent)}</Text>
                          {d.endpoint === currentEndpoint && (
                            <Badge color="blue" size="xs" variant="light">
                              {tr(
                                "profile.notificationSettingsForm.thisDevice",
                              )}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" className="tabular-nums" size="xs">
                          {fmt.dateTime(d.createdAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          aria-label={tr(
                            "profile.notificationSettingsForm.removeThisDeviceSRegistration",
                          )}
                          color="red"
                          onClick={() => removeDevice(d)}
                          variant="subtle"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
