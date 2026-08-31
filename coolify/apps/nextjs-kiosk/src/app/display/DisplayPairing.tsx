"use client";

/**
 * /display の未ペアリング状態 — QR とコードを出して待つ。
 *
 * 1. POST /api/display/pairing でコード（12桁・10分）を発行
 * 2. QR（ペアリング URL）+ 文字のコードを大きく出す
 * 3. status をポーリングし、成立したらトークンを受け取って再読込
 *
 * QR に**ペアリング URL を入れている**のは、脚立の上の人がスマホの標準
 * カメラを向けるだけで管理画面に入れるようにするため（紙に刷る書類の
 * `CKK:` 規約とは別物 — 理由は lib/display-core.ts の extractPairingCode）。
 * 読めないときのために、同じコードを文字でも出して手入力できるようにする。
 *
 * 文字は **ja 固定**。ディスプレイに利用者は居ないので言語設定が無い。
 */

import {
  Alert,
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
import { qrSvg } from "@/lib/qr";

const POLL_INTERVAL_MS = 3000;

/** 管理画面の場所。未設定なら相対パスにして「同じホスト」を仮定する。 */
const ADMIN_BASE = process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "";

function pairUrl(code: string): string {
  const path = `/settings/displays/pair?code=${encodeURIComponent(formatCode(code))}`;
  return ADMIN_BASE ? `${ADMIN_BASE.replace(/\/+$/, "")}${path}` : path;
}

/** 失効・停止のときに現場へ出す一言（「壊れた」と誤解させない）。 */
const REASON_NOTE: Partial<Record<DisplayAuthFailReason, string>> = {
  NOT_FOUND: "この画面の登録は削除されました。もう一度登録してください。",
  EXPIRED: "登録の有効期限が切れました。もう一度登録してください。",
  DISABLED: "この画面は一時停止されています。管理者にお問い合わせください。",
  REVOKED: "この画面の登録は取り消されました。もう一度登録してください。",
};

type PairState =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "expired" }
  | { phase: "error"; message: string };

type Props = { reason: DisplayAuthFailReason };

export function DisplayPairing({ reason }: Props) {
  const [state, setState] = useState<PairState>({ phase: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/display/pairing", { method: "POST" });
      const data = (await res.json()) as {
        status: string;
        code?: string;
        expiresAt?: string;
      };
      if (data.status === "ALREADY_PAIRED") {
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

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void begin();
  }, [begin]);

  // 成立ポーリング + 期限カウントダウン
  useEffect(() => {
    if (state.phase !== "showing") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/display/pairing/status?code=${encodeURIComponent(state.code)}`,
        );
        const data = (await res.json()) as { status: string };
        if (data.status === "PAIRED") {
          // Cookie は受信済み。フルリロードでサーバー側の分岐をやり直す
          window.location.reload();
        } else if (
          data.status === "EXPIRED" ||
          data.status === "NOT_FOUND" ||
          data.status === "CONSUMED"
        ) {
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

  const note = REASON_NOTE[reason];

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
                  __html: qrSvg(pairUrl(state.code)),
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
                  スマートフォンのカメラでこの QR コードを読み取り、
                  画面の名前と表示内容を選んでください。
                </Text>
                <Stack align="center" gap={4}>
                  <Text c="dimmed" size="sm">
                    登録コード
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
                  ● 登録を待っています…
                </Text>
              </Stack>
            </Flex>
          )}

          {state.phase === "expired" && (
            <>
              <Title order={2}>ディスプレイの登録</Title>
              <Alert color="orange" w="100%">
                登録コードの有効期限が切れました。
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
