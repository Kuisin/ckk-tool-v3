"use client";

/**
 * /display の未登録状態 — リンクコードを出して待つ。
 *
 * **キオスク端末の /setup と同じ 4 段**（覚えることを増やさないため、
 * 手順も画面の言い方も揃えてある）:
 *   1. begin でリンクコード（12桁・10分）を発行し、QR + テキストで表示
 *   2. 管理者が SY09 の「リンク」でコードを入力 or スキャンし、
 *      **オープン（リンク待ち）のプロファイルにのみ**リンクできる
 *   3. link-status ポーリングでリンク成立を検知 → 有効化待ちへ
 *   4. 管理者が有効化 → 365日トークン取得 → 表示開始（フルリロード）
 *
 * Cookie 消失時は localStorage の deviceId で reactivate を先に試す。
 *
 * QR の中身は**裸のコード**（キオスクと同一）。SY09 のスキャナを 1 つに
 * 保つため — 詳細は lib/display-core.ts の extractLinkCode。
 *
 * 文字は **ja 固定**。ディスプレイに利用者は居ないので言語設定が無い。
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Flex,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCode } from "@/lib/crockford";
import type { DisplayAuthFailReason } from "@/lib/display-auth";
import type { MachineHint } from "@/lib/display-core";
import { qrSvg } from "@/lib/qr";

const DEVICE_ID_KEY = "ckk_display_device_id";
const POLL_INTERVAL_MS = 3000;

/**
 * 失効・停止のときに現場へ出す一言（「壊れた」と誤解させない）。
 *
 * ★ 失効（取り消し）は **NOT_FOUND として届く**。取り消しはトークンの
 *   ハッシュごと消すので、こちら側からは「その Cookie に対応する行が無い」
 *   としか見えないため。だから NOT_FOUND の文言は「削除されました」ではなく、
 *   取り消し・行削除のどちらでも正しい言い方にしてある。
 */
const REASON_NOTE: Partial<Record<DisplayAuthFailReason, string>> = {
  NOT_FOUND: "この画面の登録は無効になりました。もう一度登録してください。",
  EXPIRED: "登録の有効期限が切れました。もう一度登録してください。",
  DISABLED: "この画面は一時停止されています。管理者にお問い合わせください。",
  REVOKED: "この画面の登録は取り消されました。もう一度登録してください。",
};

type SetupState =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "linked"; deviceId: string; deviceName: string | null }
  | { phase: "expired" }
  | { phase: "error"; message: string };

type Props = {
  reason: DisplayAuthFailReason;
  /** どの機械の何枚目か（Pi が URL に載せてくる。1 枚運用では空）。 */
  hint: MachineHint;
  /** この機械につながっている画面の総数。 */
  screenTotal: number;
};

export function DisplaySetup({ reason, hint, screenTotal }: Props) {
  const [state, setState] = useState<SetupState>({ phase: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/display/setup/begin", { method: "POST" });
      const data = (await res.json()) as {
        status: string;
        code?: string;
        expiresAt?: string;
      };
      if (data.status === "ALREADY_REGISTERED") {
        window.location.reload();
        return;
      }
      if (data.status === "WAITING" && data.code && data.expiresAt) {
        setState({
          phase: "showing",
          code: data.code,
          expiresAt: new Date(data.expiresAt).getTime(),
        });
        return;
      }
      setState({ phase: "error", message: "コードを発行できませんでした" });
    } catch {
      setState({ phase: "error", message: "サーバーに接続できません" });
    }
  }, []);

  // 初期化: Cookie 消失なら reactivate → だめなら begin（キオスクと同じ）
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const savedId = localStorage.getItem(DEVICE_ID_KEY);
        if (savedId) {
          const res = await fetch("/api/display/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: savedId }),
          });
          if (res.ok) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // 復帰に失敗しても begin は試す
      }
      void begin();
    })();
  }, [begin]);

  // 表示中: リンク成立ポーリング + 期限カウントダウン
  useEffect(() => {
    if (state.phase !== "showing") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/display/setup/link-status?code=${encodeURIComponent(state.code)}`,
        );
        const data = (await res.json()) as {
          status: string;
          deviceId?: string;
          deviceName?: string | null;
        };
        if (data.status === "LINKED" && data.deviceId) {
          localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
          setState({
            phase: "linked",
            deviceId: data.deviceId,
            deviceName: data.deviceName ?? null,
          });
        } else if (data.status === "EXPIRED" || data.status === "NOT_FOUND") {
          setState({ phase: "expired" });
        }
      } catch {
        // 通信断は次のポーリングで再試行（画面はそのまま）
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

  // リンク後: 有効化待ちポーリング
  useEffect(() => {
    if (state.phase !== "linked") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/display/setup/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: state.deviceId,
            machineId: hint.machineId,
            screenIndex: hint.screenIndex,
          }),
        });
        const data = (await res.json()) as { status: string };
        if (data.status === "CONFIRMED") {
          window.location.reload();
        } else if (data.status === "ALREADY_CONFIRMED") {
          const re = await fetch("/api/display/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: state.deviceId }),
          });
          if (re.ok) window.location.reload();
        } else if (data.status === "PENDING") {
          // リンク解除された（プロファイルがオープンに戻った）→ 最初から
          localStorage.removeItem(DEVICE_ID_KEY);
          void begin();
        }
        // LINKED はそのまま待つ
      } catch {
        // 通信断は次のポーリングで再試行
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [state, begin, hint]);

  const note = REASON_NOTE[reason];
  // 1 台に複数つないでいるときは「何枚目か」を出す。同時に 2 枚のテレビが
  // コードを出すので、どちらのコードを入力しているのか分からなくなるため。
  const screenLabel =
    screenTotal > 1 && hint.screenIndex
      ? `この機械の ${screenTotal} 枚中 ${hint.screenIndex} 枚目`
      : null;

  return (
    <Center p="xl" style={{ flex: 1 }}>
      <Paper maw={980} p="xl" radius="md" w="100%" withBorder>
        <Stack align="center" gap="lg">
          {note && (
            <Alert color="orange" w="100%">
              {note}
            </Alert>
          )}

          {state.phase === "loading" && (
            <>
              <Title order={2}>ディスプレイの登録</Title>
              <Loader size="lg" />
            </>
          )}

          {state.phase === "showing" && (
            <Flex
              align="center"
              direction={{ base: "column", sm: "row" }}
              gap="xl"
              justify="center"
              w="100%"
            >
              <Box
                bg="white"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                dangerouslySetInnerHTML={{
                  __html: qrSvg(formatCode(state.code)),
                }}
                p="md"
                style={{
                  borderRadius: "var(--mantine-radius-md)",
                  flexShrink: 0,
                  width: "clamp(240px, calc(100dvh - 360px), 380px)",
                }}
              />
              <Stack align="center" gap="md" maw={460}>
                <Title order={1}>ディスプレイの登録</Title>
                <Text c="dimmed" size="lg" ta="center">
                  管理者に「設定 → 端末管理 → ディスプレイ」でこのコードを
                  スキャンまたは入力してもらい、登録してください。
                </Text>
                {screenLabel && (
                  <Badge color="blue" size="lg" variant="light">
                    {screenLabel}
                  </Badge>
                )}
                <Stack align="center" gap={4}>
                  <Text c="dimmed" size="sm">
                    リンクコード
                  </Text>
                  <Text
                    ff="monospace"
                    fw={700}
                    style={{ fontSize: 40, letterSpacing: 2 }}
                  >
                    {formatCode(state.code)}
                  </Text>
                </Stack>
                <Text c="dimmed" size="md">
                  有効期限: {(() => {
                    const remain = Math.max(0, state.expiresAt - now);
                    const m = Math.floor(remain / 60_000);
                    const s = Math.floor((remain % 60_000) / 1000);
                    return `${m}:${String(s).padStart(2, "0")}`;
                  })()}
                </Text>
                <Text c="blue" size="md">
                  ● リンクを待っています…
                </Text>
              </Stack>
            </Flex>
          )}

          {state.phase === "linked" && (
            <>
              <Title order={2}>ディスプレイの登録</Title>
              <Alert color="blue" w="100%">
                {`リンクしました${state.deviceName ? `: ${state.deviceName}` : ""}。管理者がこのディスプレイを`}
                <b>有効化</b>
                {"すると表示を開始します。"}
              </Alert>
              <Loader size="sm" />
              <Text c="dimmed" size="md">
                ● 有効化を待っています…
              </Text>
            </>
          )}

          {state.phase === "expired" && (
            <>
              <Title order={2}>ディスプレイの登録</Title>
              <Alert color="orange" w="100%">
                リンクコードの有効期限が切れました。
              </Alert>
              <Button
                leftSection={<IconRefresh size={20} />}
                onClick={begin}
                size="lg"
              >
                新しいコードを発行
              </Button>
            </>
          )}

          {state.phase === "error" && (
            <>
              <Title order={2}>ディスプレイの登録</Title>
              <Alert color="red" w="100%">
                {state.message}
              </Alert>
              <Button
                leftSection={<IconRefresh size={20} />}
                onClick={begin}
                size="lg"
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
