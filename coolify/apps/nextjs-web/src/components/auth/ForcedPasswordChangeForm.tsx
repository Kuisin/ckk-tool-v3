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
import { useState } from "react";
import { changePasswordAction } from "@/app/(dashboard)/profile/actions";
import { useTr } from "@/hooks/useTr";

const MIN_LENGTH = 8;

export function ForcedPasswordChangeForm() {
  const tr = useTr();
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
      setError(
        tr("新しいパスワードは {MIN_LENGTH} 文字以上にしてください", {
          MIN_LENGTH: MIN_LENGTH,
        }),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tr("確認用のパスワードが一致しません"));
      return;
    }
    if (newPassword === currentPassword) {
      setError(tr("現在のパスワードとは違うものにしてください"));
      return;
    }
    setLoading(true);
    const res = await changePasswordAction({ currentPassword, newPassword });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? tr("変更に失敗しました"));
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
              <Title order={3}>{tr("パスワードの変更")}</Title>
              <Text c="dimmed" size="sm">
                {tr("初期パスワードのままです。続けるには変更してください。")}
              </Text>
            </Stack>

            <Alert
              color="orange"
              icon={<IconAlertTriangle size={16} />}
              variant="light"
            >
              {tr("変更するまで他の画面は開けません。")}
            </Alert>

            {error ? (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            ) : null}

            <PasswordInput
              autoComplete="current-password"
              label={tr("現在のパスワード")}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
              value={currentPassword}
              withAsterisk
            />
            <PasswordInput
              autoComplete="new-password"
              description={tr("{MIN_LENGTH} 文字以上", {
                MIN_LENGTH: MIN_LENGTH,
              })}
              label={tr("新しいパスワード")}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              required
              value={newPassword}
              withAsterisk
            />
            <PasswordInput
              autoComplete="new-password"
              label={tr("新しいパスワード（確認）")}
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
              {tr("変更する")}
            </Button>

            <Button
              color="gray"
              fullWidth
              onClick={() => signOut({ callbackUrl: "/login" })}
              variant="subtle"
            >
              {tr("ログアウト")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
