"use client";

/**
 * LoginForm — SSO（Authentik）を主とするログイン。
 *
 * 通常ユーザーは SSO ボタンのみ。credentials（デモ/開発アカウント）は下部の
 * テキストリンクから開く隠しフォーム — 一般ユーザー向けではない。
 * SSO は AUTH_AUTHENTIK_* が未設定の間は無効表示（設定で自動有効化）。
 *
 * マウント時に端末シグネチャを /api/device-signals へ投げ、署名 Cookie を
 * 受け取っておく（認証イベントの記録用）。SSO は Server Action で即
 * リダイレクトしてしまうので、**押した後ではなくマウント時**に送るのが要点。
 * 失敗してもログインには一切影響しない。
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
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ssoSignIn } from "@/app/(auth)/login/actions";
import { ensureDeviceSignals } from "@/lib/device-signals-client";

export function LoginForm({
  ssoEnabled,
  callbackUrl = "/",
}: {
  ssoEnabled: boolean;
  /** ログイン後に戻る先（サーバ側で safeCallbackPath 済み）。 */
  callbackUrl?: string;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  /** Auth.js が /login?error=… で返すコードを表示用の文言に。 */
  const authErrorMessages: Record<string, string> = {
    AccessDenied: tr("auth.loginForm.accessDeniedAccountDisabledOrSso"),
    OAuthCallbackError: tr("auth.loginForm.ssoResponseProcessingFailed"),
    Configuration: tr("auth.loginForm.thereIsAnErrorInTheAuthentication"),
    Verification: tr("auth.loginForm.theLinkIsInvalidOrExpired"),
  };
  const [devOpen, setDevOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(
    urlError
      ? (authErrorMessages[urlError] ??
          tr("auth.loginForm.loginError", { code: urlError }))
      : null,
  );

  // 端末シグネチャの収集・送信（投げっぱなし。SSO ボタンを押す前に済ませる）
  useEffect(() => {
    void ensureDeviceSignals();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // マウント時の送信が終わっていなければ待つ（Cookie が付いてから認証する）
    await ensureDeviceSignals();
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(tr("auth.loginForm.theUsernameOrPasswordIsIncorrect"));
      return;
    }
    // 元々開こうとしていた画面へ戻す（無ければホーム）。
    router.push(callbackUrl);
    router.refresh();
  };

  // Auth.js v5 の Server Action パターン: form の action で signIn("authentik") を
  // サーバー実行 → Authentik へリダイレクト（PKCE/state cookie を確実にセット）。
  const ssoButton = (
    <form
      action={ssoSignIn}
      onSubmit={() => {
        setSsoLoading(true);
        setSsoError(null);
      }}
      style={{ width: "100%" }}
    >
      {/* 戻り先を Server Action へ渡す（サーバ側でも畳み直す）。 */}
      <input name="callbackUrl" type="hidden" value={callbackUrl} />
      <Button
        disabled={!ssoEnabled || ssoLoading}
        fullWidth
        leftSection={<IconLogin2 size={16} />}
        loading={ssoLoading}
        size="md"
        type="submit"
      >
        {ssoLoading ? "認証画面へ移動中…" : tr("auth.loginForm.logInWithSso")}
      </Button>
    </form>
  );

  return (
    <Center mih="100dvh" p="md">
      <Paper maw={380} p="xl" radius="md" shadow="sm" w="100%" withBorder>
        <Stack gap="lg">
          <Stack gap={4}>
            <Title order={3}>
              {tr("auth.loginForm.cKKBusinessManagementSystem")}
            </Title>
            <Text c="dimmed" size="sm">
              {tr("auth.loginForm.logInWithYourOrganizationAccount")}
            </Text>
          </Stack>

          {ssoEnabled ? (
            ssoButton
          ) : (
            <Tooltip
              label={tr("auth.loginForm.sSOIsNotConfiguredPleaseContact")}
            >
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
              {tr("auth.loginForm.logInWithADevelopmentAccount")}
            </Anchor>
            <Collapse expanded={devOpen}>
              <form onSubmit={submit}>
                <Stack gap="sm">
                  <Text c="dimmed" size="xs">
                    {tr("auth.loginForm.forDevelopmentAndTestingOrdinaryUsers")}
                  </Text>
                  <TextInput
                    label={tr("common.username")}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    required
                    size="sm"
                    value={username}
                  />
                  <PasswordInput
                    label={tr("auth.loginForm.password")}
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
                    {tr("common.logIn")}
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
