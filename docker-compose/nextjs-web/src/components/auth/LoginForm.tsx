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
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

/** Auth.js が /login?error=… で返すコードを日本語に。 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "アクセスが拒否されました。アカウントが無効、または SSO から必要な情報（ユーザー名/メール）が取得できませんでした。管理者にお問い合わせください。",
  OAuthCallbackError:
    "SSO の応答処理に失敗しました（トークン取得/検証エラー）。時間をおいて再度お試しください。",
  Configuration: "認証設定にエラーがあります。管理者にお問い合わせください。",
  Verification: "リンクが無効か期限切れです。もう一度お試しください。",
};

export function LoginForm({ ssoEnabled }: { ssoEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [devOpen, setDevOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(
    urlError
      ? (AUTH_ERROR_MESSAGES[urlError] ?? `ログインエラー: ${urlError}`)
      : null,
  );

  // SSO 開始。redirect:false で認可 URL を受け取り、明示的に遷移する。
  // 途中はローディング表示、失敗はエラー表示（無反応＝「何も起きない」を解消）。
  const ssoLogin = async () => {
    setSsoLoading(true);
    setSsoError(null);
    try {
      const res = await signIn("authentik", {
        callbackUrl: "/",
        redirect: false,
      });
      if (res?.url) {
        // Authentik の認可画面へ（社内ネットワーク/VPN 経由で到達）。
        window.location.href = res.url;
        return; // 遷移するまでローディング維持
      }
      setSsoError(
        "SSO を開始できませんでした。VPN 接続を確認して再度お試しください。",
      );
    } catch {
      setSsoError(
        "SSO を開始できませんでした。VPN 接続を確認して再度お試しください。",
      );
    }
    setSsoLoading(false);
  };

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
      disabled={!ssoEnabled || ssoLoading}
      fullWidth
      leftSection={<IconLogin2 size={16} />}
      loading={ssoLoading}
      onClick={ssoLogin}
      size="md"
    >
      {ssoLoading ? "認証画面へ移動中…" : "SSO でログイン"}
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
          {ssoError && (
            <Text c="red" size="xs" ta="center">
              {ssoError}
            </Text>
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
