"use client";

/**
 * ProfileView — プロフィール画面（本人）。
 *
 * - 基本情報（名前・ユーザー名・種別・最終ログイン・承認グループ）
 * - メールアドレス変更（通知メールの宛先 — lib/notifications の email チャネル）
 * - パスワード変更（credentials ユーザーのみ表示。SSO ユーザーは非表示）
 * - プッシュ通知の登録デバイス一覧 + 解除
 */

import {
  Avatar,
  Badge,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceMobile } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  changePasswordAction,
  removeDeviceAction,
  updateEmailAction,
} from "@/app/(dashboard)/profile/actions";
import { DangerButton, SaveButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { APPROVAL_GROUP_TYPE_LABEL } from "@/lib/enum-labels";
import { type LocalizedText, localized } from "@/lib/format";

export interface ProfileData {
  username: string;
  displayName: string;
  email: string | null;
  group: string;
  hasPassword: boolean;
  lastLoginAt: string | null;
  approvalGroups: { type: string; name: unknown }[];
  devices: { id: string; userAgent: string | null; createdAt: string }[];
}

const USER_GROUP_LABEL: Record<string, string> = {
  SYSTEM: "システム",
  EMPLOYEE: "従業員",
  GUEST: "ゲスト",
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** UA 文字列から表示用の短いデバイス名を作る（厳密判定は不要）。 */
function deviceLabel(ua: string | null): string {
  if (!ua) return "不明なデバイス";
  const os = ua.includes("iPhone")
    ? "iPhone"
    : ua.includes("iPad")
      ? "iPad"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("Mac OS X") || ua.includes("Macintosh")
          ? "Mac"
          : ua.includes("Windows")
            ? "Windows"
            : "その他";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome/")
      ? "Chrome"
      : ua.includes("Safari/")
        ? "Safari"
        : ua.includes("Firefox/")
          ? "Firefox"
          : "";
  return browser ? `${os} / ${browser}` : os;
}

export function ProfileView({ user }: { user: ProfileData }) {
  const [email, setEmail] = useState(user.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [devices, setDevices] = useState(user.devices);
  const [emailPending, startEmail] = useTransition();
  const [pwPending, startPw] = useTransition();

  const saveEmail = () => {
    startEmail(async () => {
      const res = await updateEmailAction(email);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "メールアドレスを更新しました（通知メールの宛先になります）",
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

  const savePassword = () => {
    if (newPassword !== newPassword2) {
      notifications.show({
        title: "エラー",
        message: "新しいパスワードが一致しません",
        color: "red",
      });
      return;
    }
    startPw(async () => {
      const res = await changePasswordAction({ currentPassword, newPassword });
      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setNewPassword2("");
        notifications.show({
          title: "変更しました",
          message: "次回から新しいパスワードでログインしてください",
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

  const removeDevice = async (id: string) => {
    const res = await removeDeviceAction(id);
    if (res.ok) {
      setDevices((d) => d.filter((x) => x.id !== id));
      notifications.show({
        title: "解除しました",
        message: "このデバイスへのプッシュ通知を停止しました",
        color: "green",
      });
    } else {
      notifications.show({ title: "エラー", message: res.error, color: "red" });
    }
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[{ label: "プロフィール" }]}
        title="プロフィール"
      />

      {/* 基本情報 */}
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" gap="lg" wrap="nowrap">
          <Avatar color="blue" radius="xl" size={64}>
            {user.displayName.slice(0, 2)}
          </Avatar>
          <Stack className="min-w-0 flex-1" gap="md">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <FieldValue label="表示名" value={user.displayName} />
              <FieldValue label="ユーザー名" value={user.username} />
              <FieldValue
                label="種別"
                value={USER_GROUP_LABEL[user.group] ?? user.group}
              />
              <FieldValue
                label="最終ログイン"
                value={formatTs(user.lastLoginAt)}
              />
              <FieldValue
                label="承認グループ"
                value={
                  user.approvalGroups.length === 0 ? (
                    "—"
                  ) : (
                    <Group gap={4}>
                      {user.approvalGroups.map((g) => (
                        <Badge key={g.type} size="sm" variant="light">
                          {APPROVAL_GROUP_TYPE_LABEL[g.type] ??
                            localized(g.name as LocalizedText)}
                        </Badge>
                      ))}
                    </Group>
                  )
                }
              />
            </SimpleGrid>
          </Stack>
        </Group>
      </Paper>

      {/* メールアドレス（通知宛先） */}
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            メールアドレス
          </Text>
          <Text c="dimmed" size="xs">
            通知メール（承認依頼・取込結果など）の宛先に使われます。空にすると
            メール通知は届きません。
          </Text>
          <Group align="flex-end" gap="sm">
            <TextInput
              className="flex-1"
              maw={360}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="user@example.co.jp"
              type="email"
              value={email}
            />
            <SaveButton
              loading={emailPending}
              onClick={saveEmail}
              type="button"
            />
          </Group>
        </Stack>
      </Paper>

      {/* パスワード変更（credentials ユーザーのみ） */}
      {user.hasPassword && (
        <Paper p="md" radius="md" shadow="xs">
          <Stack gap="sm">
            <Text fw={600} size="sm">
              パスワード変更
            </Text>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
              <PasswordInput
                label="現在のパスワード"
                onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                value={currentPassword}
                withAsterisk
              />
              <PasswordInput
                description="8 文字以上"
                label="新しいパスワード"
                onChange={(e) => setNewPassword(e.currentTarget.value)}
                value={newPassword}
                withAsterisk
              />
              <PasswordInput
                label="新しいパスワード（確認）"
                onChange={(e) => setNewPassword2(e.currentTarget.value)}
                value={newPassword2}
                withAsterisk
              />
            </SimpleGrid>
            <div>
              <SaveButton
                disabled={!currentPassword || !newPassword || !newPassword2}
                loading={pwPending}
                onClick={savePassword}
                type="button"
              >
                パスワードを変更
              </SaveButton>
            </div>
          </Stack>
        </Paper>
      )}

      {/* プッシュ通知の登録デバイス */}
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            プッシュ通知の登録デバイス
          </Text>
          {devices.length === 0 ? (
            <Text c="dimmed" size="xs">
              登録されたデバイスはありません。設定 → 通知設定
              から有効化できます。
            </Text>
          ) : (
            devices.map((d) => (
              <Group justify="space-between" key={d.id} wrap="nowrap">
                <Group className="min-w-0" gap="sm" wrap="nowrap">
                  <IconDeviceMobile size={18} />
                  <Stack gap={0}>
                    <Text size="sm">{deviceLabel(d.userAgent)}</Text>
                    <Text c="dimmed" size="xs">
                      登録: {formatTs(d.createdAt)}
                    </Text>
                  </Stack>
                </Group>
                <DangerButton onClick={() => removeDevice(d.id)}>
                  解除
                </DangerButton>
              </Group>
            ))
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
