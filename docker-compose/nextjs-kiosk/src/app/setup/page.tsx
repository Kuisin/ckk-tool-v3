"use client";

/**
 * /setup — 端末登録画面。
 *
 * POST /api/kiosk/setup で登録コードを発行し、QR + コード + カウントダウンを
 * 表示。3 秒間隔で /api/kiosk/setup/confirm をポーリングし、管理者が
 * nextjs-web の端末管理（SY09）で有効化したら Cookie を得て /login へ。
 * deviceId は localStorage に保持（Cookie 消失時の reactivate 用）。
 */

import {
  Alert,
  Box,
  Button,
  Center,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCode } from "@/lib/crockford";
import { qrSvg } from "@/lib/qr";

const DEVICE_ID_KEY = "kiosk_device_id";
const POLL_INTERVAL_MS = 3000;

type SetupState =
  | { phase: "loading" }
  | { phase: "waiting"; deviceId: string; code: string; expiresAt: number }
  | { phase: "expired" }
  | { phase: "error"; message: string };

export default function SetupPage() {
  const [state, setState] = useState<SetupState>({ phase: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      // Cookie 消失だが登録済み端末 → deviceId で再有効化を先に試す
      const savedId = localStorage.getItem(DEVICE_ID_KEY);
      if (savedId) {
        const res = await fetch("/api/kiosk/setup/reactivate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: savedId }),
        });
        if (res.ok) {
          window.location.replace("/login");
          return;
        }
      }

      const res = await fetch("/api/kiosk/setup", { method: "POST" });
      const data = (await res.json()) as {
        registered: boolean;
        deviceId: string;
        registrationCode?: string;
        expiresAt?: string;
      };
      if (data.registered) {
        window.location.replace("/login");
        return;
      }
      localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
      setState({
        phase: "waiting",
        deviceId: data.deviceId,
        code: data.registrationCode ?? "",
        expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : 0,
      });
    } catch {
      setState({ phase: "error", message: "サーバーに接続できません" });
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void begin();
  }, [begin]);

  // 有効化待ちポーリング + カウントダウン
  useEffect(() => {
    if (state.phase !== "waiting") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/kiosk/setup/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: state.deviceId }),
        });
        const data = (await res.json()) as { status: string };
        if (data.status === "CONFIRMED") {
          window.location.replace("/login");
        } else if (data.status === "ALREADY_CONFIRMED") {
          // トークン発行済みなのに Cookie が無い → 再有効化
          const re = await fetch("/api/kiosk/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: state.deviceId }),
          });
          if (re.ok) window.location.replace("/login");
        }
      } catch {
        // 通信断は次のポーリングで再試行
      }
    }, POLL_INTERVAL_MS);
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= state.expiresAt) setState({ phase: "expired" });
    }, 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [state]);

  if (state.phase === "loading") {
    return (
      <Center mih="calc(100dvh - 48px)">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Center mih="calc(100dvh - 48px)" p="md">
      <Paper maw={480} p="xl" radius="md" w="100%">
        <Stack align="center" gap="md">
          <Title order={2}>専用端末設定</Title>
          <Text c="dimmed" size="sm" ta="center">
            このデバイスを専用端末として登録します。 管理者に「設定 →
            端末管理」で下のコードを有効化してもらってください。
          </Text>

          {state.phase === "waiting" && (
            <>
              <Box
                // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                dangerouslySetInnerHTML={{
                  __html: qrSvg(
                    JSON.stringify({
                      type: "KIOSK_SETUP",
                      code: state.code,
                      deviceId: state.deviceId,
                    }),
                  ),
                }}
                w={240}
              />
              <Stack align="center" gap={4}>
                <Text c="dimmed" size="xs">
                  登録コード
                </Text>
                <Text ff="monospace" fw={700} style={{ fontSize: 28 }}>
                  {formatCode(state.code)}
                </Text>
              </Stack>
              <Text c="dimmed" size="sm">
                有効期限: {(() => {
                  const remain = Math.max(0, state.expiresAt - now);
                  const m = Math.floor(remain / 60_000);
                  const s = Math.floor((remain % 60_000) / 1000);
                  return `${m}:${String(s).padStart(2, "0")}`;
                })()}
              </Text>
              <Text c="blue" size="sm">
                ● 有効化を待っています…
              </Text>
            </>
          )}

          {state.phase === "expired" && (
            <>
              <Alert color="orange" w="100%">
                登録コードの有効期限が切れました。
              </Alert>
              <Button leftSection={<IconRefresh size={20} />} onClick={begin}>
                新しいコードを発行
              </Button>
            </>
          )}

          {state.phase === "error" && (
            <>
              <Alert color="red" w="100%">
                {state.message}
              </Alert>
              <Button leftSection={<IconRefresh size={20} />} onClick={begin}>
                再試行
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
