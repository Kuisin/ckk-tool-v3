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
import { useTr } from "@/hooks/useTr";

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
  const tr = useTr();
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
          title: tr("保存しました"),
          message: tr("通知設定を更新しました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
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
          title: tr("許可されませんでした"),
          message: tr("ブラウザの通知許可が必要です"),
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
          title: tr("有効化しました"),
          message: tr("このデバイスでプッシュ通知を受け取ります"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
      }
    } catch (e) {
      console.error("[push] subscribe failed:", e);
      notifications.show({
        title: tr("エラー"),
        message:
          isIos && !isStandalone
            ? tr("iOS ではホーム画面に追加した PWA からのみ有効化できます")
            : tr("プッシュ通知の有効化に失敗しました"),
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
        title: tr("無効化しました"),
        message: tr("このデバイスのプッシュ通知を解除しました"),
        color: "green",
      });
      router.refresh();
    } finally {
      setPushBusy(false);
    }
  };

  const removeDevice = (device: PushDevice) => {
    openConfirm({
      title: tr("登録デバイスの削除"),
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
              title: tr("エラー"),
              message: tr(res.error),
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
          { label: tr("プロフィール"), href: "/profile" },
          { label: tr("通知設定") },
        ]}
        title={tr("通知設定")}
      />

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="md">
          <Text fw={600} size="sm">
            {tr("通知チャネル")}
          </Text>
          <Switch
            checked={settings.emailEnabled}
            description={
              mailerConfigured
                ? tr("承認依頼・取込結果などをメールで受け取る")
                : tr(
                    "メールサーバー未設定のため現在は送信されません（設定は保存できます）",
                  )
            }
            label={tr("メール通知")}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                emailEnabled: e.currentTarget.checked,
              }))
            }
          />
          <Switch
            checked={settings.pushEnabled}
            description={tr("有効化したデバイス（下記）にプッシュ通知を送る")}
            label={tr("プッシュ通知")}
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
            {tr("このデバイスのプッシュ通知")}
          </Text>
          {!pushConfigured || !vapidPublicKey ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              {tr(
                "サーバーの VAPID 鍵が未設定のため、プッシュ通知は利用できません。",
              )}
            </Alert>
          ) : showIosGuide ? (
            <Alert
              color="blue"
              icon={<IconDeviceMobile size={16} />}
              title={tr(
                "iPhone / iPad はホーム画面に追加して使います（iOS 16.4 以降）",
              )}
            >
              <List size="sm" spacing={4} type="ordered">
                <List.Item>
                  {tr("Safari でこのサイトを開き、共有ボタン（")}
                  <IconShare2 size={14} style={{ verticalAlign: "-2px" }} />
                  {tr("）をタップ")}
                </List.Item>
                <List.Item>{tr("「ホーム画面に追加」を選ぶ")}</List.Item>
                <List.Item>
                  {tr(
                    "ホーム画面の「CKK」アイコンから開き直し、この画面で「このデバイスで有効化」を押す",
                  )}
                </List.Item>
              </List>
            </Alert>
          ) : !pushSupported ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              {tr(
                "このブラウザはプッシュ通知に対応していません。Chrome / Edge /\n              Firefox の最新版をご利用ください。",
              )}
            </Alert>
          ) : permission === "denied" ? (
            <Alert
              color="orange"
              icon={<IconInfoCircle size={16} />}
              title={tr("通知がブロックされています")}
            >
              {tr(
                "ブラウザの設定でこのサイトの通知を許可し直してください（Chrome:\n              アドレスバーの鍵アイコン → サイトの設定 → 通知 → 許可。Android:\n              サイト設定に加えて OS の通知設定でも Chrome\n              の通知を許可）。解除後に再度有効化できます。",
              )}
            </Alert>
          ) : subscribed ? (
            <>
              <Text c="dimmed" size="xs">
                {tr(
                  "このデバイスは登録済みです。ロック画面・デスクトップに通知が届きます。",
                )}
              </Text>
              <div>
                <SecondaryButton
                  loading={pushBusy}
                  onClick={disablePushOnDevice}
                >
                  {tr("このデバイスで無効化")}
                </SecondaryButton>
              </div>
            </>
          ) : (
            <>
              <Text c="dimmed" size="xs">
                {tr(
                  "有効化するとブラウザの通知許可を求めます。デバイスごとに設定が必要です。",
                )}
              </Text>
              <Group gap="sm">
                <PrimaryButton
                  leftSection={<IconBellRinging size={16} />}
                  loading={pushBusy}
                  onClick={enablePushOnDevice}
                >
                  {tr("このデバイスで有効化")}
                </PrimaryButton>
                {installPrompt && (
                  <SecondaryButton
                    leftSection={<IconDownload size={16} />}
                    onClick={installApp}
                  >
                    {tr("アプリをインストール")}
                  </SecondaryButton>
                )}
              </Group>
              {installPrompt && (
                <Text c="dimmed" size="xs">
                  {tr(
                    "インストールするとホーム画面 /\n                  デスクトップから起動でき、アプリとして通知を受け取れます（任意\n                  — ブラウザのままでも通知は届きます）。",
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
            {tr("登録デバイス")}
          </Text>
          {devices.length === 0 ? (
            <Text c="dimmed" size="sm">
              {tr(
                "登録済みのデバイスはありません。上の「このデバイスで有効化」から登録できます。",
              )}
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={420}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("デバイス")}</Table.Th>
                    <Table.Th>{tr("登録日時")}</Table.Th>
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
                              {tr("このデバイス")}
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
                          aria-label={tr("このデバイスの登録を削除")}
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
