"use client";

/**
 * LoginForm — SSO（Authentik）を主とするログイン。
 *
 * 通常ユーザーは SSO ボタンのみ。credentials（デモ/開発アカウント）は下部の
 * テキストリンクから開く隠しフォーム — 一般ユーザー向けではない。
 * SSO は AUTH_AUTHENTIK_* が未設定の間は無効表示（設定で自動有効化）。
 */

import {
  Anchor,
  Button,
  Center,
  Collapse,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconLogin2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm({ ssoEnabled }: { ssoEnabled: boolean }) {
  const router = useRouter();
  const [devOpen, setDevOpen] = useState(false);
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

  const ssoButton = (
    <Button
      disabled={!ssoEnabled}
      fullWidth
      leftSection={<IconLogin2 size={16} />}
      onClick={() => signIn("authentik", { callbackUrl: "/" })}
      size="md"
    >
      SSO でログイン
    </Button>
  );

  return (
    <Center mih="100dvh" p="md">
      <Paper maw={380} p="xl" radius="md" shadow="sm" w="100%" withBorder>
        <Stack gap="lg">
          <Stack gap={4}>
            <Title order={3}>CKK 業務管理システム</Title>
            <Text c="dimmed" size="sm">
              組織アカウント（SSO）でログインしてください
            </Text>
          </Stack>

          {ssoEnabled ? (
            ssoButton
          ) : (
            <Tooltip label="SSO は未設定です（管理者にお問い合わせください）">
              <span>{ssoButton}</span>
            </Tooltip>
          )}

          <Stack gap="xs">
            <Anchor
              c="dimmed"
              component="button"
              onClick={() => setDevOpen((o) => !o)}
              size="xs"
              ta="center"
              type="button"
            >
              開発用アカウントでログイン
            </Anchor>
            <Collapse expanded={devOpen}>
              <form onSubmit={submit}>
                <Stack gap="sm">
                  <Text c="dimmed" size="xs">
                    開発・検証用です。通常のユーザーは SSO をご利用ください。
                  </Text>
                  <TextInput
                    label="ユーザー名"
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    required
                    size="sm"
                    value={username}
                  />
                  <PasswordInput
                    label="パスワード"
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    required
                    size="sm"
                    value={password}
                  />
                  {error && (
                    <Text c="red" size="xs">
                      {error}
                    </Text>
                  )}
                  <Button
                    fullWidth
                    loading={loading}
                    type="submit"
                    variant="default"
                  >
                    ログイン
                  </Button>
                </Stack>
              </form>
            </Collapse>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  );
}
