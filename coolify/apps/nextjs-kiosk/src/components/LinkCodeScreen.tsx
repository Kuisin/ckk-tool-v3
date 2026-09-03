"use client";

/**
 * LinkCodeScreen — 「リンクコードを出して待つ」画面の見た目。**共有端末と
 * ディスプレイで同じものを使う。**
 *
 * 手順を揃えた（作る → リンク → 有効化）のに画面が別々だと、結局
 * 「タブレットのときはこう、テレビのときはこう」と 2 つ覚えることになる。
 * 実際そうなっていて、余白も文字の大きさも見出しの段も微妙に違った。
 * 部品を 1 つにすれば、直したつもりで片方だけ直る事故も起きない。
 *
 * **本当に違うのは見る距離だけ**なので、そこだけ `variant` で分ける:
 *   handheld — タブレット（手に持つ / 腕の長さ）
 *   wall     — 壁のテレビ（数 m 離れて見る）
 * 大きさ以外（並び・順序・言い回しの型）は共通。
 *
 * 流れ（どの API を叩くか）は呼び出し側が持つ。ここは受け取った状態を
 * 描くだけで、fetch もポーリングもしない。
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
import type { ReactNode } from "react";
import { formatCode } from "@/lib/crockford";
import { fillMessage } from "@/lib/i18n";
import { qrSvg } from "@/lib/qr";
import { useI18n } from "./I18nProvider";

export type LinkCodePhase =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "linked"; message: ReactNode }
  | { phase: "expired" }
  | { phase: "error"; message: string };

type Variant = "handheld" | "wall";

/** 見る距離だけの違い。ここ以外は共通にする。 */
const SIZES = {
  handheld: {
    cardWide: 880,
    cardNarrow: 520,
    qr: "clamp(220px, calc(100dvh - 400px), 340px)",
    codeFontSize: 30,
    infoWidth: 420,
    lead: "sm" as const,
    padding: "md" as const,
  },
  wall: {
    // テレビは数 m 離れて見るので、同じ並びのまま一回り大きくする。
    // 桁を読み上げてもらう場面もあるので、コードはとくに大きく。
    cardWide: 1100,
    cardNarrow: 640,
    qr: "clamp(260px, calc(100dvh - 320px), 440px)",
    codeFontSize: 48,
    infoWidth: 520,
    lead: "lg" as const,
    padding: "xl" as const,
  },
} satisfies Record<Variant, unknown>;

type Props = {
  variant: Variant;
  /** 見出し（端末リンク / ディスプレイの登録）。全フェーズで同じ文字。 */
  title: string;
  /** コード表示中の説明文。「誰に何をしてもらうか」を 1 文で。 */
  instruction: ReactNode;
  state: LinkCodePhase;
  /** 期限切れ・失敗時の「やり直す」。 */
  onRetry: () => void;
  /** 状態の上に出す注意（失効した etc.）。無ければ出さない。 */
  notice?: ReactNode;
  /** コードの上に出す補足（何枚目か etc.）。無ければ出さない。 */
  badge?: ReactNode;
  /**
   * 一番上に出す会社の印（ロゴ）。**壁のディスプレイだけが渡す。**
   * 通りがかりに見られる画面なので「これは会社のものだ」が要る。
   * 手に持つ端末は誰の何かが自明なので渡さない。
   */
  brand?: ReactNode;
  /** いまの時刻（カウントダウン用）。呼び出し側が 1 秒ごとに更新する。 */
  now: number;
};

export function LinkCodeScreen({
  variant,
  title,
  instruction,
  state,
  onRetry,
  notice,
  badge,
  brand,
  now,
}: Props) {
  const { m } = useI18n();
  const s = SIZES[variant];
  const wide = state.phase === "showing";

  return (
    <Center p={s.padding} style={{ flex: 1, overflow: "hidden" }}>
      <Paper
        maw={wide ? s.cardWide : s.cardNarrow}
        p="xl"
        radius="md"
        w="100%"
        withBorder
      >
        <Stack align="center" gap="md">
          {brand}
          {notice && (
            <Alert color="orange" w="100%">
              {notice}
            </Alert>
          )}

          {/* コード表示中は右カラムに見出しを出すので、ここでは出さない */}
          {!wide && <Title order={2}>{title}</Title>}

          {state.phase === "loading" && <Loader size="lg" />}

          {/* 横向きでスクロールなしに収まるよう、QR 左 + 情報右の 2 カラム
              （縦向き・狭い幅では縦積みに落ちる） */}
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
                className="kiosk-qr"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                dangerouslySetInnerHTML={{
                  __html: qrSvg(formatCode(state.code)),
                }}
                p="md"
                style={{
                  borderRadius: "var(--mantine-radius-md)",
                  flexShrink: 0,
                  width: s.qr,
                }}
              />
              <Stack align="center" gap="sm" maw={s.infoWidth}>
                <Title order={2}>{title}</Title>
                <Text c="dimmed" size={s.lead} ta="center">
                  {instruction}
                </Text>
                {badge}
                <Stack align="center" gap={4}>
                  <Text c="dimmed" size="xs">
                    {m.linkCode.label}
                  </Text>
                  <Text
                    ff="monospace"
                    fw={700}
                    style={{ fontSize: s.codeFontSize }}
                  >
                    {formatCode(state.code)}
                  </Text>
                </Stack>
                <Text c="dimmed" size={s.lead}>
                  {fillMessage(m.linkCode.expiresAt, {
                    countdown: countdown(state.expiresAt - now),
                  })}
                </Text>
                <Text c="blue" size={s.lead}>
                  {m.linkCode.waitingForLink}
                </Text>
              </Stack>
            </Flex>
          )}

          {state.phase === "linked" && (
            <>
              <Alert color="blue" w="100%">
                {state.message}
              </Alert>
              <Loader size="sm" />
              <Text c="dimmed" size={s.lead}>
                {m.linkCode.waitingForActivation}
              </Text>
            </>
          )}

          {state.phase === "expired" && (
            <>
              <Alert color="orange" w="100%">
                {m.linkCode.expired}
              </Alert>
              <Button leftSection={<IconRefresh size={20} />} onClick={onRetry}>
                {m.linkCode.issueNewCode}
              </Button>
            </>
          )}

          {state.phase === "error" && (
            <>
              <Alert color="red" w="100%">
                {state.message}
              </Alert>
              <Button leftSection={<IconRefresh size={20} />} onClick={onRetry}>
                {m.linkCode.retry}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}

/** 残り時間 m:ss（負値は 0:00）。 */
function countdown(remainMs: number): string {
  const remain = Math.max(0, remainMs);
  const m = Math.floor(remain / 60_000);
  const sec = Math.floor((remain % 60_000) / 1000);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
