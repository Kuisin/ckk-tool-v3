"use client";

/**
 * /login — QR コードログイン（状態機械を 1 ページに集約）。
 *
 *   checking → scanning → (pin_setup | pin_verify | locked) → 成功で /
 *   端末が未登録/無効なら /setup・/device-error へ。
 */

import {
  Alert,
  Button,
  Center,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PinKeypad } from "@/components/PinKeypad";
import { QrScannerView } from "@/components/QrScannerView";

type LoginState =
  | { phase: "checking" }
  | { phase: "scanning" }
  | { phase: "pin_setup"; ticket: string; firstPin?: string }
  | { phase: "pin_verify"; ticket: string }
  | { phase: "locked"; until: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({ phase: "checking" });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // 端末信頼の初期チェック
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/kiosk/setup");
        const data = (await res.json()) as {
          registered: boolean;
          reason?: string;
        };
        if (cancelled) return;
        if (data.registered) {
          setState({ phase: "scanning" });
        } else if (data.reason === "DISABLED" || data.reason === "REVOKED") {
          router.replace(`/device-error?reason=${data.reason}`);
        } else {
          router.replace("/setup");
        }
      } catch {
        if (!cancelled) setState({ phase: "scanning" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleScan = useCallback(
    async (payload: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await fetch("/api/qr/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: payload }),
        });
        const data = (await res.json()) as {
          state: string;
          ticket?: string;
          until?: string;
          reason?: string;
        };
        switch (data.state) {
          case "OK":
            router.replace("/");
            return;
          case "PIN_SETUP_REQUIRED":
            setState({ phase: "pin_setup", ticket: data.ticket ?? "" });
            return;
          case "PIN_REQUIRED":
            setState({ phase: "pin_verify", ticket: data.ticket ?? "" });
            return;
          case "LOCKED":
            setState({ phase: "locked", until: data.until ?? null });
            return;
          case "DEVICE_INVALID":
            router.replace(
              data.reason === "DISABLED" || data.reason === "REVOKED"
                ? `/device-error?reason=${data.reason}`
                : "/setup",
            );
            return;
          case "CARD_SUSPENDED":
            notifications.show({
              color: "orange",
              title: "カード一時停止中",
              message:
                "このカードは停止されています。管理者に連絡してください。",
            });
            return;
          default:
            notifications.show({
              color: "red",
              title: "ログインできません",
              message: "カードが無効です。管理者に確認してください。",
            });
        }
      } catch {
        notifications.show({
          color: "red",
          title: "通信エラー",
          message: "もう一度スキャンしてください。",
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [router],
  );

  const submitPin = useCallback(
    async (
      purpose: "PIN_SETUP" | "PIN_VERIFY",
      ticket: string,
      pin: string,
    ) => {
      setBusy(true);
      try {
        const res = await fetch("/api/kiosk/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket, purpose, pin }),
        });
        const data = (await res.json()) as {
          state: string;
          ticket?: string;
          until?: string;
        };
        switch (data.state) {
          case "OK":
            router.replace("/");
            return;
          case "PIN_MISMATCH":
            notifications.show({
              color: "red",
              title: "PIN が違います",
              message: "もう一度入力してください。",
            });
            setState({ phase: "pin_verify", ticket: data.ticket ?? "" });
            return;
          case "LOCKED":
            setState({ phase: "locked", until: data.until ?? null });
            return;
          case "TICKET_EXPIRED":
          case "PIN_ALREADY_SET":
            notifications.show({
              color: "orange",
              title: "もう一度スキャンしてください",
              message: "操作がタイムアウトしました。",
            });
            setState({ phase: "scanning" });
            return;
          default:
            notifications.show({
              color: "red",
              title: "エラー",
              message: "最初からやり直してください。",
            });
            setState({ phase: "scanning" });
        }
      } catch {
        notifications.show({
          color: "red",
          title: "通信エラー",
          message: "もう一度お試しください。",
        });
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return (
    <Center bg="var(--mantine-color-dark-7)" mih="100dvh" p="md">
      <Paper maw={640} p="xl" radius="md" w="100%">
        <Stack align="center" gap="lg">
          <Title order={2}>QRコードログイン</Title>

          {state.phase === "checking" && <Loader size="lg" />}

          {state.phase === "scanning" && (
            <>
              <Text c="dimmed">社員QRカードをスキャンしてください</Text>
              <QrScannerView onScan={handleScan} paused={busy} />
            </>
          )}

          {state.phase === "pin_setup" && state.firstPin === undefined && (
            <PinKeypad
              onSubmit={(pin) => setState({ ...state, firstPin: pin })}
              submitting={busy}
              subtitle="初回ログインです。4〜6桁の PIN を設定してください。"
              title="PIN を設定"
            />
          )}

          {state.phase === "pin_setup" && state.firstPin !== undefined && (
            <PinKeypad
              onSubmit={(pin) => {
                if (pin !== state.firstPin) {
                  notifications.show({
                    color: "red",
                    title: "PIN が一致しません",
                    message: "最初から入力し直してください。",
                  });
                  setState({ ...state, firstPin: undefined });
                  return;
                }
                void submitPin("PIN_SETUP", state.ticket, pin);
              }}
              submitting={busy}
              subtitle="確認のためもう一度入力してください。"
              title="PIN を再入力"
            />
          )}

          {state.phase === "pin_verify" && (
            <PinKeypad
              onSubmit={(pin) =>
                void submitPin("PIN_VERIFY", state.ticket, pin)
              }
              submitting={busy}
              subtitle="3日以上利用がなかったため、本人確認が必要です。"
              title="PIN を入力"
            />
          )}

          {state.phase === "locked" && (
            <Stack align="center" gap="md">
              <Alert color="red" icon={<IconLock size={20} />}>
                PIN の入力に複数回失敗したため、一時的にロックされています。
                {state.until &&
                  ` 解除予定: ${new Date(state.until).toLocaleTimeString("ja-JP")}`}
              </Alert>
              <Button
                leftSection={<IconArrowLeft size={20} />}
                onClick={() => setState({ phase: "scanning" })}
                variant="default"
              >
                スキャンに戻る
              </Button>
            </Stack>
          )}

          {(state.phase === "pin_setup" || state.phase === "pin_verify") && (
            <Button
              color="gray"
              disabled={busy}
              leftSection={<IconArrowLeft size={18} />}
              onClick={() => setState({ phase: "scanning" })}
              variant="subtle"
            >
              スキャンに戻る
            </Button>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
