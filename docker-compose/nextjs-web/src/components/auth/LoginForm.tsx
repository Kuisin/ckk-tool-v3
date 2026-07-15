"use client";

/**
 * LoginForm — credentials ログイン + （有効時）Authentik SSO ボタン。
 * デモユーザー: demo1〜demo5 / demo2026（shared-db/sql/demo-users-seed.sql）。
 */

import {
  Button,
  Center,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconLogin2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm({ ssoEnabled }: { ssoEnabled: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("ユーザー名またはパスワードが正しくありません");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <Center mih="100dvh" p="md">
      <Paper maw={380} p="xl" radius="md" shadow="sm" w="100%" withBorder>
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={3}>CKK 業務管理システム</Title>
            <Text c="dimmed" size="sm">
              アカウントでログインしてください
            </Text>
          </Stack>
          <form onSubmit={submit}>
            <Stack gap="sm">
              <TextInput
                autoFocus
                label="ユーザー名"
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
                value={username}
              />
              <PasswordInput
                label="パスワード"
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                value={password}
              />
              {error && (
                <Text c="red" size="xs">
                  {error}
                </Text>
              )}
              <Button
                fullWidth
                leftSection={<IconLogin2 size={16} />}
                loading={loading}
                type="submit"
              >
                ログイン
              </Button>
            </Stack>
          </form>
          {ssoEnabled && (
            <>
              <Divider label="または" />
              <Button
                fullWidth
                onClick={() => signIn("authentik", { callbackUrl: "/" })}
                variant="default"
              >
                SSO でログイン（Authentik）
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
