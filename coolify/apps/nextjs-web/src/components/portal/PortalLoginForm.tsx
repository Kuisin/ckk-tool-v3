"use client";

/**
 * PortalLoginForm — 確認コードによるログイン（パスワードなし）。
 *
 * 2 段階: ① アドレスを入れてコードを送る ② コードを入れる。
 * メールが受け取れない人のために、バックアップコードへ切り替えられる。
 *
 * ■ 応答を区別しない
 * 発行の結果は**常に同じ文言**（未登録・無効・送信失敗を区別しない）。
 * サーバー側が同じものしか返さないので、画面はそれをそのまま出すだけ。
 */

import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  requestPortalOtp,
  verifyPortalBackupCode,
  verifyPortalOtp,
} from "@/app/(portal)/portal/login/actions";
import { useTr } from "@/hooks/useTr";

type Mode = "email" | "code" | "backup";

export function PortalLoginForm() {
  const tr = useTr();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeRef, setChallengeRef] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submitEmail() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("email", email);
      const res = await requestPortalOtp(fd);
      setChallengeRef(res.challengeRef);
      setNotice(res.message);
      setMode("code");
    });
  }

  function submitCode() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("challengeRef", challengeRef ?? "");
      fd.set("code", code);
      const res = await verifyPortalOtp(fd);
      if (res.ok) {
        router.replace("/portal");
        return;
      }
      setError(res.error);
    });
  }

  function submitBackup() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("code", code);
      const res = await verifyPortalBackupCode(fd);
      if (res.ok) {
        router.replace("/portal");
        return;
      }
      setError(res.error);
    });
  }

  return (
    <Stack gap="md" maw={420} mt="xl" mx="auto">
      <Title order={3}>{tr("取引先ポータル")}</Title>

      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          {notice && mode === "code" ? (
            <Alert
              color="blue"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              <Text size="xs">{notice}</Text>
            </Alert>
          ) : null}

          {error ? (
            <Alert color="red" variant="light">
              <Text size="xs">{error}</Text>
            </Alert>
          ) : null}

          {mode === "email" ? (
            <>
              <TextInput
                autoComplete="email"
                label={tr("メールアドレス")}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.co.jp"
                type="email"
                value={email}
              />
              <Button fullWidth loading={pending} onClick={submitEmail}>
                {tr("確認コードを送る")}
              </Button>
              <Anchor
                component="button"
                onClick={() => {
                  setError(null);
                  setCode("");
                  setMode("backup");
                }}
                size="xs"
                type="button"
              >
                {tr("メールが受け取れない場合")}
              </Anchor>
            </>
          ) : null}

          {mode === "code" ? (
            <>
              <TextInput
                autoComplete="one-time-code"
                autoFocus
                label={tr("確認コード")}
                onChange={(e) => setCode(e.currentTarget.value)}
                placeholder="ABCD-EFGH"
                value={code}
              />
              <Button fullWidth loading={pending} onClick={submitCode}>
                {tr("ログイン")}
              </Button>
              <Group justify="space-between">
                <Anchor
                  component="button"
                  onClick={() => {
                    setError(null);
                    setCode("");
                    setMode("email");
                  }}
                  size="xs"
                  type="button"
                >
                  {tr("アドレスを入れ直す")}
                </Anchor>
                <Anchor
                  component="button"
                  onClick={() => {
                    setError(null);
                    setCode("");
                    setMode("backup");
                  }}
                  size="xs"
                  type="button"
                >
                  {tr("メールが受け取れない場合")}
                </Anchor>
              </Group>
            </>
          ) : null}

          {mode === "backup" ? (
            <>
              <Text c="dimmed" size="xs">
                {tr(
                  tr(
                    "担当営業からお渡ししたバックアップコードを入力してください。 1\n                枚につき 1 回だけ使えます。",
                  ),
                )}
              </Text>
              <TextInput
                autoComplete="email"
                label={tr("メールアドレス")}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.co.jp"
                type="email"
                value={email}
              />
              <TextInput
                label={tr("バックアップコード")}
                onChange={(e) => setCode(e.currentTarget.value)}
                placeholder="ABCD-EFGH-IJ"
                value={code}
              />
              <Button fullWidth loading={pending} onClick={submitBackup}>
                {tr("ログイン")}
              </Button>
              <Anchor
                component="button"
                onClick={() => {
                  setError(null);
                  setCode("");
                  setMode("email");
                }}
                size="xs"
                type="button"
              >
                {tr("確認コードでログインする")}
              </Anchor>
            </>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
