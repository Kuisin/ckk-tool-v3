"use client";

/**
 * ForcedPasswordChangeForm — 既定パスワードのまま使わせないための強制変更画面。
 *
 * `users.password_change_required` が立っている間、ダッシュボードはここへ
 * リダイレクトし続ける。変更に成功するとフラグが下り、通常の画面に入れる。
 * ログアウトの導線も置く（別アカウントで入り直したいとき用）。
 */

import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconKey } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { changePasswordAction } from "@/app/(dashboard)/profile/actions";

const MIN_LENGTH = 8;

export function ForcedPasswordChangeForm() {
  const tr = useTranslations();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < MIN_LENGTH) {
      setError(`新しいパスワードは ${MIN_LENGTH} 文字以上にしてください`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(
        tr("auth.forcedPasswordChangeForm.theConfirmationPasswordDoesNotMatch"),
      );
      return;
    }
    if (newPassword === currentPassword) {
      setError(
        tr(
          "auth.forcedPasswordChangeForm.chooseSomethingDifferentFromTheCurrent",
        ),
      );
      return;
    }
    setLoading(true);
    const res = await changePasswordAction({ currentPassword, newPassword });
    setLoading(false);
    if (!res.ok) {
      setError(
        res.error ?? tr("auth.forcedPasswordChangeForm.couldNotChangeIt"),
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <Center mih="100dvh" p="md">
      <Paper maw={420} p="xl" radius="md" shadow="sm" w="100%" withBorder>
        <form onSubmit={submit}>
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={3}>
                {tr("auth.forcedPasswordChangeForm.changeThePassword")}
              </Title>
              <Text c="dimmed" size="sm">
                {tr(
                  "auth.forcedPasswordChangeForm.thePasswordIsStillTheInitial",
                )}
              </Text>
            </Stack>

            <Alert
              color="orange"
              icon={<IconAlertTriangle size={16} />}
              variant="light"
            >
              {tr(
                "auth.forcedPasswordChangeForm.youCannotOpenOtherScreensUntil",
              )}
            </Alert>

            {error ? (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            ) : null}

            <PasswordInput
              autoComplete="current-password"
              label={tr("common.currentPassword")}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
              value={currentPassword}
              withAsterisk
            />
            <PasswordInput
              autoComplete="new-password"
              description={`${MIN_LENGTH} 文字以上`}
              label={tr("common.newPassword")}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              required
              value={newPassword}
              withAsterisk
            />
            <PasswordInput
              autoComplete="new-password"
              label={tr("common.newPasswordConfirm")}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
              value={confirmPassword}
              withAsterisk
            />

            <Button
              fullWidth
              leftSection={<IconKey size={16} />}
              loading={loading}
              type="submit"
            >
              {tr("common.change")}
            </Button>

            <Button
              color="gray"
              fullWidth
              onClick={() => signOut({ callbackUrl: "/login" })}
              variant="subtle"
            >
              {tr("common.logOut")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
