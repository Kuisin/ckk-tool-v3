"use client";

/**
 * NotificationSettingsForm — 通知チャネル設定 + このデバイスの Web Push 購読。
 *
 * - メール / プッシュの ON/OFF（user_notification_settings へ upsert）
 * - 「このデバイスで有効化」: SW 登録 → 通知許可 → PushManager 購読 →
 *   Server Action で push_subscriptions へ保存（VAPID 公開鍵はサーバーから
 *   props で受け取る — ランタイム env で動くよう NEXT_PUBLIC インライン化に
 *   依存しない）
 */

import { Alert, Paper, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBellRinging, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscriptionAction,
  saveNotificationSettingAction,
  savePushSubscriptionAction,
} from "@/components/layout/notification-actions";
import {
  PrimaryButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";

interface ChannelSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/** base64url → Uint8Array（PushManager.subscribe の applicationServerKey 用）。 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(
    (base64 + padding).replaceAll("-", "+").replaceAll("_", "/"),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationSettingsForm({
  initial,
  mailerConfigured,
  pushConfigured,
  vapidPublicKey,
}: {
  initial: ChannelSettings;
  mailerConfigured: boolean;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
}) {
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [pushSupported, setPushSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // このデバイスの購読状態を確認
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushSupported(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(Boolean(sub));
      } catch {
        setSubscribed(false);
      }
    })();
  }, []);

  const save = () => {
    startTransition(async () => {
      const res = await saveNotificationSettingAction(settings);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "通知設定を更新しました",
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
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
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notifications.show({
          title: "許可されませんでした",
          message: "ブラウザの通知許可が必要です",
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
        notifications.show({
          title: "有効化しました",
          message: "このデバイスでプッシュ通知を受け取ります",
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    } catch (e) {
      console.error("[push] subscribe failed:", e);
      notifications.show({
        title: "エラー",
        message: "プッシュ通知の有効化に失敗しました",
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
      notifications.show({
        title: "無効化しました",
        message: "このデバイスのプッシュ通知を解除しました",
        color: "green",
      });
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: "設定", href: "/settings" },
          { label: "通知設定" },
        ]}
        title="通知設定"
      />

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="md">
          <Text fw={600} size="sm">
            通知チャネル
          </Text>
          <Switch
            checked={settings.emailEnabled}
            description={
              mailerConfigured
                ? "承認依頼・取込結果などをメールで受け取る"
                : "メールサーバー未設定のため現在は送信されません（設定は保存できます）"
            }
            label="メール通知"
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                emailEnabled: e.currentTarget.checked,
              }))
            }
          />
          <Switch
            checked={settings.pushEnabled}
            description="有効化したデバイス（下記）にプッシュ通知を送る"
            label="プッシュ通知"
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
            このデバイスのプッシュ通知
          </Text>
          {!pushConfigured || !vapidPublicKey ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              サーバーの VAPID 鍵が未設定のため、プッシュ通知は利用できません。
            </Alert>
          ) : !pushSupported ? (
            <Alert color="orange" icon={<IconInfoCircle size={16} />}>
              このブラウザはプッシュ通知に対応していません。iOS / iPadOS は
              ホーム画面に追加した PWA から有効化してください（iOS 16.4 以降）。
            </Alert>
          ) : subscribed ? (
            <>
              <Text c="dimmed" size="xs">
                このデバイスは登録済みです。ロック画面・デスクトップに通知が届きます。
              </Text>
              <div>
                <SecondaryButton
                  loading={pushBusy}
                  onClick={disablePushOnDevice}
                >
                  このデバイスで無効化
                </SecondaryButton>
              </div>
            </>
          ) : (
            <>
              <Text c="dimmed" size="xs">
                有効化するとブラウザの通知許可を求めます。デバイスごとに設定が必要です。
              </Text>
              <div>
                <PrimaryButton
                  leftSection={<IconBellRinging size={16} />}
                  loading={pushBusy}
                  onClick={enablePushOnDevice}
                >
                  このデバイスで有効化
                </PrimaryButton>
              </div>
            </>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
