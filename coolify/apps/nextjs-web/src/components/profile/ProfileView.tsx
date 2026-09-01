"use client";

/**
 * ProfileView — プロフィール画面（本人）。
 *
 * - プロフィール写真（本人がアップロード / 削除。AD からは取得しない）
 * - 基本情報（名前・ユーザー名・種別・最終ログイン・承認グループ）
 * - メールアドレス変更（通知メールの宛先 — lib/notifications の email チャネル）
 * - パスワード変更（credentials ユーザーのみ表示。SSO ユーザーは非表示）
 * - プッシュ通知の登録デバイス一覧 + 解除
 */

import {
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
import { IconCamera, IconDeviceMobile, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import {
  changePasswordAction,
  removeDeviceAction,
  updateEmailAction,
} from "@/app/(dashboard)/profile/actions";
import {
  DangerButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import {
  type CroppedImages,
  ImageCropModal,
} from "@/components/ui/ImageCropModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { type LocalizedText, localized } from "@/lib/format";

export interface ProfileData {
  username: string;
  displayName: string;
  /** プロフィール写真の配信 URL（未設定なら null → イニシャル表示）。 */
  avatarUrl: string | null;
  /** 同・小サイズ（一覧・ヘッダー・履歴用）。 */
  avatarThumbUrl: string | null;
  email: string | null;
  group: string;
  hasPassword: boolean;
  lastLoginAt: string | null;
  approvalGroups: { id: number; name: unknown }[];
  devices: { id: string; userAgent: string | null; createdAt: string }[];
}

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
function deviceLabel(
  ua: string | null,
  tr: ReturnType<typeof useTranslations>,
): string {
  if (!ua) return tr("profile.profileView.unknownDevice");
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
            : tr("common.other");
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
  const tr = useTranslations();
  const userGroupLabel: Record<string, string> = {
    SYSTEM: tr("common.system"),
    EMPLOYEE: tr("profile.profileView.employee"),
    GUEST: tr("common.guest"),
  };
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarThumbUrl, setAvatarThumbUrl] = useState(user.avatarThumbUrl);
  /** 選択直後の元ファイル — 切り抜きモーダルに渡す。 */
  const [cropTarget, setCropTarget] = useState<File | null>(null);
  const [photoPending, startPhoto] = useTransition();
  const [email, setEmail] = useState(user.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [devices, setDevices] = useState(user.devices);
  const [emailPending, startEmail] = useTransition();
  const [pwPending, startPw] = useTransition();

  /**
   * 写真の設定・削除は /api/avatars（Route Handler）へ。Server Action は
   * ボディ 1MB 上限で写真が 413 になるため使わない。
   */
  const callAvatarApi = async (init: RequestInit): Promise<unknown> => {
    const res = await fetch("/api/avatars", init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      throw new Error(json?.error ?? `HTTP ${res.status}`);
    }
    return json;
  };

  /** 切り抜き済みの正方形画像（大・小）を保存する。 */
  const uploadPhoto = (cropped: CroppedImages) => {
    startPhoto(async () => {
      try {
        const body = new FormData();
        body.append("file", cropped.full);
        body.append("thumb", cropped.thumb);
        const json = (await callAvatarApi({ method: "POST", body })) as {
          avatarUrl: string;
          avatarThumbUrl: string;
        };
        setAvatarUrl(json.avatarUrl);
        setAvatarThumbUrl(json.avatarThumbUrl);
        setCropTarget(null);
        notifications.show({
          title: tr("common.saved3"),
          message: tr("profile.profileView.theProfilePhotoWasUpdated"),
          color: "green",
        });
      } catch (err) {
        notifications.show({
          title: tr("common.error2"),
          message:
            err instanceof Error ? err.message : tr("common.unknownError"),
          color: "red",
        });
      } finally {
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    });
  };

  const deletePhoto = () => {
    startPhoto(async () => {
      try {
        await callAvatarApi({ method: "DELETE" });
        setAvatarUrl(null);
        setAvatarThumbUrl(null);
        notifications.show({
          title: tr("common.deleted"),
          message: tr("profile.profileView.theProfilePhotoWasRemoved"),
          color: "green",
        });
      } catch (err) {
        notifications.show({
          title: tr("common.error2"),
          message:
            err instanceof Error ? err.message : tr("common.unknownError"),
          color: "red",
        });
      }
    });
  };

  const saveEmail = () => {
    startEmail(async () => {
      const res = await updateEmailAction(email);
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr(
            "profile.profileView.theEmailAddressWasUpdatedNotification",
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

  const savePassword = () => {
    if (newPassword !== newPassword2) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("profile.profileView.theNewPasswordsDoNotMatch"),
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
          title: tr("profile.profileView.changed"),
          message: tr("profile.profileView.useTheNewPasswordFromNext"),
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

  const removeDevice = async (id: string) => {
    const res = await removeDeviceAction(id);
    if (res.ok) {
      setDevices((d) => d.filter((x) => x.id !== id));
      notifications.show({
        title: tr("profile.profileView.released"),
        message: tr("profile.profileView.pushNotificationsToThisDeviceWere"),
        color: "green",
      });
    } else {
      notifications.show({
        title: tr("common.error2"),
        message: res.error,
        color: "red",
      });
    }
  };

  return (
    <Stack gap="md" maw={960} mx="auto" w="100%">
      <PageHeader
        breadcrumbs={[{ label: tr("common.profile") }]}
        title={tr("common.profile")}
      />

      {/* 正方形に切り抜いてから保存する（表示は常に真円）。 */}
      <ImageCropModal
        file={cropTarget}
        loading={photoPending}
        onCancel={() => {
          setCropTarget(null);
          if (photoInputRef.current) photoInputRef.current.value = "";
        }}
        onConfirm={uploadPhoto}
      />

      {/* 基本情報 */}
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" gap="lg" wrap="nowrap">
          {/* プロフィール写真 — 本人がアップロード。未設定はイニシャル。 */}
          <Stack align="center" gap={6}>
            <UserAvatar
              name={user.displayName}
              size={64}
              src={avatarUrl}
              thumbSrc={avatarThumbUrl}
            />
            <Group gap={2} wrap="nowrap">
              <GhostButton
                leftSection={<IconCamera size={14} />}
                loading={photoPending}
                onClick={() => photoInputRef.current?.click()}
                size="xs"
              >
                {avatarUrl ? "変更" : tr("profile.profileView.setAPhoto")}
              </GhostButton>
              {avatarUrl && (
                <GhostButton
                  aria-label={tr("profile.profileView.removeTheProfilePhoto")}
                  color="red"
                  disabled={photoPending}
                  onClick={deletePhoto}
                  px={6}
                  size="xs"
                >
                  <IconTrash size={14} />
                </GhostButton>
              )}
            </Group>
            <input
              accept="image/png,image/jpeg,image/webp"
              hidden
              // 選択したら即アップロードせず、まず切り抜きモーダルへ。
              onChange={(e) => setCropTarget(e.target.files?.[0] ?? null)}
              ref={photoInputRef}
              type="file"
            />
          </Stack>
          <Stack className="min-w-0 flex-1" gap="md">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <FieldValue
                label={tr("common.displayName")}
                value={user.displayName}
              />
              <FieldValue label={tr("common.username")} value={user.username} />
              <FieldValue
                label={tr("common.type2")}
                value={userGroupLabel[user.group] ?? user.group}
              />
              <FieldValue
                label={tr("common.lastLogin")}
                value={formatTs(user.lastLoginAt)}
              />
              <FieldValue
                label={tr("common.approvalGroup")}
                value={
                  user.approvalGroups.length === 0 ? (
                    "—"
                  ) : (
                    <Group gap={4}>
                      {user.approvalGroups.map((g) => (
                        <Badge key={g.id} size="sm" variant="light">
                          {localized(g.name as LocalizedText)}
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
            {tr("common.emailAddress")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("profile.profileView.usedAsTheAddressForNotification")}
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
              {tr("profile.profileView.changePassword")}
            </Text>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
              <PasswordInput
                label={tr("common.currentPassword")}
                onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                value={currentPassword}
                withAsterisk
              />
              <PasswordInput
                description={tr("profile.profileView.n8CharactersOrMore")}
                label={tr("common.newPassword")}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
                value={newPassword}
                withAsterisk
              />
              <PasswordInput
                label={tr("common.newPasswordConfirm")}
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
                {tr("profile.profileView.changeThePassword")}
              </SaveButton>
            </div>
          </Stack>
        </Paper>
      )}

      {/* プッシュ通知の登録デバイス */}
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              {tr("profile.profileView.devicesRegisteredForPush")}
            </Text>
            <SecondaryButton href="/profile/notifications">
              {tr("common.notificationSettings")}
            </SecondaryButton>
          </Group>
          {devices.length === 0 ? (
            <Text c="dimmed" size="xs">
              {tr("profile.profileView.noDevicesAreRegisteredYouCan")}
            </Text>
          ) : (
            devices.map((d) => (
              <Group justify="space-between" key={d.id} wrap="nowrap">
                <Group className="min-w-0" gap="sm" wrap="nowrap">
                  <IconDeviceMobile size={18} />
                  <Stack gap={0}>
                    <Text size="sm">{deviceLabel(d.userAgent, tr)}</Text>
                    <Text c="dimmed" size="xs">
                      登録: {formatTs(d.createdAt)}
                    </Text>
                  </Stack>
                </Group>
                <DangerButton onClick={() => removeDevice(d.id)}>
                  {tr("common.release")}
                </DangerButton>
              </Group>
            ))
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
