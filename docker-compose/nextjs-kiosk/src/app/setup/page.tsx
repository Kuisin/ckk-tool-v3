"use client";

/**
 * /setup — 端末リンク画面（profile-first フロー）。
 *
 * 管理者が SY09 で作成した端末プロファイルの**リンクコード**（12桁・24h）を
 * 入力（または管理画面に表示された QR をカメラでスキャン）してリンクする。
 * リンク後は「有効化待ち」— 管理者がプロファイルを有効化すると confirm
 * ポーリングが 30日デバイストークンを受け取り /login へ（フルリロード —
 * ヘッダーの端末名反映のため）。
 * Cookie 消失時は localStorage の deviceId で reactivate を先に試す。
 */

import {
  Alert,
  Button,
  Center,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconLink, IconQrcode, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QrScannerView } from "@/components/QrScannerView";
import { formatCode, normalizeCode } from "@/lib/crockford";

const DEVICE_ID_KEY = "kiosk_device_id";
const POLL_INTERVAL_MS = 3000;

type SetupState =
  | { phase: "loading" }
  | { phase: "enter"; error?: string; scanning?: boolean }
  | { phase: "waiting"; deviceId: string; deviceName: string | null }
  | { phase: "error"; message: string };

export default function SetupPage() {
  const [state, setState] = useState<SetupState>({ phase: "loading" });
  const [codeInput, setCodeInput] = useState("");
  const [linking, setLinking] = useState(false);
  const startedRef = useRef(false);

  // 初期化: 登録済みなら /login へ、Cookie 消失なら reactivate を試す
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const status = await fetch("/api/kiosk/setup");
        const data = (await status.json()) as { registered: boolean };
        if (data.registered) {
          window.location.replace("/login");
          return;
        }
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
        setState({ phase: "enter" });
      } catch {
        setState({ phase: "error", message: "サーバーに接続できません" });
      }
    })();
  }, []);

  const link = useCallback(async (rawCode: string) => {
    const code = normalizeCode(rawCode);
    if (code.length !== 12) {
      setState({ phase: "enter", error: "コードは 12 文字です" });
      return;
    }
    setLinking(true);
    try {
      const res = await fetch("/api/kiosk/setup/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as {
        status: string;
        deviceId?: string;
        deviceName?: string | null;
      };
      if (data.status === "ALREADY_REGISTERED") {
        window.location.replace("/login");
        return;
      }
      if (data.status === "LINKED" && data.deviceId) {
        localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
        setState({
          phase: "waiting",
          deviceId: data.deviceId,
          deviceName: data.deviceName ?? null,
        });
        return;
      }
      setState({
        phase: "enter",
        error:
          data.status === "CODE_EXPIRED"
            ? "コードの有効期限が切れています。管理者に再発行を依頼してください。"
            : "コードが正しくありません。",
      });
    } catch {
      setState({
        phase: "enter",
        error: "通信エラー。もう一度お試しください。",
      });
    } finally {
      setLinking(false);
    }
  }, []);

  // リンク後: 有効化待ちポーリング
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
          const re = await fetch("/api/kiosk/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: state.deviceId }),
          });
          if (re.ok) window.location.replace("/login");
        }
        // PENDING / LINKED はそのまま待つ
      } catch {
        // 通信断は次のポーリングで再試行
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [state]);

  return (
    <Center mih="calc(100dvh - 48px)" p="md">
      <Paper maw={560} p="xl" radius="md" w="100%">
        <Stack align="center" gap="md">
          <Title order={2}>端末リンク</Title>

          {state.phase === "loading" && <Loader size="lg" />}

          {state.phase === "enter" && !state.scanning && (
            <>
              <Text c="dimmed" size="sm" ta="center">
                管理者が「設定 → 端末管理」で作成した端末プロファイルの
                リンクコードを入力してください。
              </Text>
              <TextInput
                aria-label="リンクコード"
                onChange={(e) => setCodeInput(e.currentTarget.value)}
                placeholder="XXXX-XXXX-XXXX"
                styles={{
                  input: {
                    textAlign: "center",
                    fontFamily: "monospace",
                    fontSize: 24,
                    letterSpacing: 2,
                  },
                }}
                value={formatCode(normalizeCode(codeInput).slice(0, 12))}
                w="100%"
              />
              {state.error && (
                <Alert color="red" w="100%">
                  {state.error}
                </Alert>
              )}
              <Button
                disabled={normalizeCode(codeInput).length !== 12}
                leftSection={<IconLink size={20} />}
                loading={linking}
                onClick={() => link(codeInput)}
                w="100%"
              >
                この端末をリンク
              </Button>
              <Button
                leftSection={<IconQrcode size={20} />}
                onClick={() => setState({ phase: "enter", scanning: true })}
                variant="subtle"
              >
                管理画面の QR をスキャン
              </Button>
            </>
          )}

          {state.phase === "enter" && state.scanning && (
            <>
              <Text c="dimmed" size="sm" ta="center">
                管理画面（端末管理）に表示されたリンクコードの QR を
                カメラにかざしてください。
              </Text>
              <QrScannerView
                onScan={(payload) => void link(payload)}
                paused={linking}
              />
              <Button
                onClick={() => setState({ phase: "enter" })}
                variant="subtle"
              >
                コードを手入力する
              </Button>
            </>
          )}

          {state.phase === "waiting" && (
            <>
              <Alert color="blue" w="100%">
                リンクしました{state.deviceName ? `: ${state.deviceName}` : ""}
                。 管理者がこのプロファイルを<b>有効化</b>
                すると利用を開始できます。
              </Alert>
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                ● 有効化を待っています…
              </Text>
            </>
          )}

          {state.phase === "error" && (
            <>
              <Alert color="red" w="100%">
                {state.message}
              </Alert>
              <Button
                leftSection={<IconRefresh size={20} />}
                onClick={() => window.location.reload()}
              >
                再試行
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
