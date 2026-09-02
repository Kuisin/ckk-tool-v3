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
import { useI18n } from "@/components/I18nProvider";
import { PinKeypad } from "@/components/PinKeypad";
import { QrScannerView } from "@/components/QrScannerView";
import { fillMessage } from "@/lib/i18n";
import { beginUserPageTracking } from "@/lib/last-page";
import { playLoginSound } from "@/lib/sound";
import {
  type AttestOutcome,
  getBridge,
  runAttestation,
} from "@/lib/wrapper-bridge";

type LoginState =
  | { phase: "checking" }
  | { phase: "scanning" }
  | { phase: "pin_setup"; ticket: string; firstPin?: string }
  | { phase: "pin_verify"; ticket: string }
  | { phase: "locked"; until: string | null }
  | { phase: "attest_blocked"; outcome: AttestOutcome };

export function LoginView() {
  const router = useRouter();
  const { m } = useI18n();
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
          attestation?: { required: boolean; attested: boolean };
        };
        if (cancelled) return;
        if (data.registered) {
          const att = data.attestation;
          if (att?.required && !att.attested) {
            const outcome = await runAttestation();
            if (cancelled) return;
            setState(
              outcome === "OK"
                ? { phase: "scanning" }
                : { phase: "attest_blocked", outcome },
            );
            return;
          }
          // required でなくても、専用アプリなら端末鍵で名乗っておく（12h Cookie）。
          // 退出 PIN の配布（/api/kiosk/unlock-pin）はアテステーション済みの
          // 端末にしか渡さないので、ここで名乗らないと PinSync がビルド時の
          // 既定 PIN のままになる。失敗しても画面は止めない（認可ではない）。
          if (!att?.attested && getBridge()) {
            await runAttestation();
            if (cancelled) return;
          }
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
          userId?: string;
        };
        switch (data.state) {
          case "OK":
            playLoginSound();
            // このユーザーが最後に開いていたページへ直行（端末ローカル復元）
            router.replace(
              data.userId ? beginUserPageTracking(data.userId) : "/",
            );
            // ヘッダーの利用者名を出すため layout を作り直す（replace だけでは
            // 同じ layout が使い回され、「未ログイン」のまま入ってしまう）
            router.refresh();
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
            if (data.reason === "ATTEST_REQUIRED") {
              // attest Cookie 失効（12h）— その場で再アテストして継続
              const outcome = await runAttestation();
              if (outcome !== "OK") {
                setState({ phase: "attest_blocked", outcome });
              }
              return;
            }
            router.replace(
              data.reason === "DISABLED" || data.reason === "REVOKED"
                ? `/device-error?reason=${data.reason}`
                : "/setup",
            );
            return;
          case "CARD_SUSPENDED":
            notifications.show({
              color: "orange",
              title: m.login.cardSuspendedTitle,
              message: m.login.cardSuspendedMessage,
            });
            return;
          case "CARD_EXPIRED":
            notifications.show({
              color: "orange",
              title: m.login.cardExpiredTitle,
              message: m.login.cardExpiredMessage,
            });
            return;
          default:
            notifications.show({
              color: "red",
              title: m.login.cannotLoginTitle,
              message: m.login.cannotLoginMessage,
            });
        }
      } catch {
        notifications.show({
          color: "red",
          title: m.login.communicationErrorTitle,
          message: m.login.scanAgainMessage,
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [router, m],
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
          userId?: string;
        };
        switch (data.state) {
          case "OK":
            playLoginSound();
            router.replace(
              data.userId ? beginUserPageTracking(data.userId) : "/",
            );
            return;
          case "PIN_MISMATCH":
            notifications.show({
              color: "red",
              title: m.login.pinIncorrectTitle,
              message: m.login.pinIncorrectMessage,
            });
            setState({ phase: "pin_verify", ticket: data.ticket ?? "" });
            return;
          case "PIN_WEAK":
            notifications.show({
              color: "red",
              title: m.login.pinWeakTitle,
              message: m.login.pinWeakMessage,
            });
            setState({ phase: "pin_setup", ticket, firstPin: undefined });
            return;
          case "LOCKED":
            setState({ phase: "locked", until: data.until ?? null });
            return;
          case "CARD_EXPIRED":
            notifications.show({
              color: "orange",
              title: m.login.cardExpiredTitle,
              message: m.login.cardExpiredMessage,
            });
            setState({ phase: "scanning" });
            return;
          case "TICKET_EXPIRED":
          case "PIN_ALREADY_SET":
            notifications.show({
              color: "orange",
              title: m.login.retryScanTitle,
              message: m.login.timedOutMessage,
            });
            setState({ phase: "scanning" });
            return;
          default:
            notifications.show({
              color: "red",
              title: m.login.genericErrorTitle,
              message: m.login.startOverMessage,
            });
            setState({ phase: "scanning" });
        }
      } catch {
        notifications.show({
          color: "red",
          title: m.login.communicationErrorTitle,
          message: m.login.retryMessage,
        });
      } finally {
        setBusy(false);
      }
    },
    [router, m],
  );

  return (
    <Center p="md" style={{ flex: 1 }}>
      <Paper maw={640} p="xl" radius="md" w="100%" withBorder>
        <Stack align="center" gap="lg">
          <Title order={2}>{m.login.title}</Title>

          {state.phase === "checking" && <Loader size="lg" />}

          {state.phase === "scanning" && (
            <>
              <Text c="dimmed">{m.login.scanPrompt}</Text>
              <QrScannerView onScan={handleScan} paused={busy} />
            </>
          )}

          {state.phase === "pin_setup" && state.firstPin === undefined && (
            <PinKeypad
              maxLength={6}
              minLength={6}
              onSubmit={(pin) => setState({ ...state, firstPin: pin })}
              submitting={busy}
              subtitle={m.login.pinSetupSubtitle}
              title={m.login.pinSetupTitle}
            />
          )}

          {state.phase === "pin_setup" && state.firstPin !== undefined && (
            <PinKeypad
              maxLength={6}
              minLength={6}
              onSubmit={(pin) => {
                if (pin !== state.firstPin) {
                  notifications.show({
                    color: "red",
                    title: m.login.pinMismatchTitle,
                    message: m.login.pinMismatchMessage,
                  });
                  setState({ ...state, firstPin: undefined });
                  return;
                }
                void submitPin("PIN_SETUP", state.ticket, pin);
              }}
              submitting={busy}
              subtitle={m.login.pinReenterSubtitle}
              title={m.login.pinReenterTitle}
            />
          )}

          {state.phase === "pin_verify" && (
            <PinKeypad
              onSubmit={(pin) =>
                void submitPin("PIN_VERIFY", state.ticket, pin)
              }
              submitting={busy}
              subtitle={m.login.pinVerifySubtitle}
              title={m.login.pinVerifyTitle}
            />
          )}

          {state.phase === "attest_blocked" && (
            <Stack align="center" gap="md">
              <Alert color="red" icon={<IconLock size={20} />}>
                {state.outcome === "KEY_MISMATCH"
                  ? m.login.attestKeyMismatch
                  : state.outcome === "NO_BRIDGE"
                    ? m.login.attestNoBridge
                    : m.login.attestGenericFail}
              </Alert>
              <Button
                onClick={() => window.location.reload()}
                variant="default"
              >
                {m.login.retry}
              </Button>
            </Stack>
          )}

          {state.phase === "locked" && (
            <Stack align="center" gap="md">
              <Alert color="red" icon={<IconLock size={20} />}>
                {m.login.lockedMessage}
                {state.until &&
                  fillMessage(m.login.lockedUntil, {
                    time: new Date(state.until).toLocaleTimeString("ja-JP"),
                  })}
              </Alert>
              <Button
                leftSection={<IconArrowLeft size={20} />}
                onClick={() => setState({ phase: "scanning" })}
                variant="default"
              >
                {m.login.backToScan}
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
              {m.login.backToScan}
            </Button>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
