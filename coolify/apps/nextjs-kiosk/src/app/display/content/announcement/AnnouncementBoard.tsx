"use client";

import { Center, Stack, Text } from "@mantine/core";
import { useI18n } from "@/components/I18nProvider";
import { Clock } from "../_shared/Clock";

/**
 * お知らせの見た目。文章 1 つを画面いっぱいに出すだけ。
 *
 * 文字の大きさは**本文の長さから決める** — 短い連絡ほど大きく出したいが、
 * 固定サイズにすると長文がはみ出す。行数も文字数もばらつくので、
 * ざっくり 3 段階に落として、はみ出しだけは起こさないようにしている。
 */

const LEVEL: Record<string, { color: string; background: string }> = {
  info: {
    color: "var(--mantine-color-blue-3)",
    background: "var(--mantine-color-dark-8)",
  },
  warn: { color: "var(--mantine-color-yellow-4)", background: "#2a2410" },
  alert: { color: "var(--mantine-color-red-4)", background: "#2b1416" },
};

function fontSize(message: string): string {
  if (message.length <= 20) return "clamp(2.5rem, 9vw, 7rem)";
  if (message.length <= 80) return "clamp(2rem, 5vw, 4rem)";
  return "clamp(1.5rem, 3vw, 2.5rem)";
}

export function AnnouncementBoard({
  message,
  level,
  showClock,
}: {
  message: string;
  level: string;
  showClock: boolean;
}) {
  const { m } = useI18n();
  const style = LEVEL[level] ?? LEVEL.info;
  const text = message.trim();

  return (
    <Center
      p="xl"
      // height:100% — 外側（iframe）が画面ぶんの高さを持っているので、
      // ここで 100dvh を取り直すと共通見出しのぶんだけはみ出す
      style={{ background: style.background, flex: 1, height: "100%" }}
    >
      <Stack align="center" gap="xl" maw="90%">
        {text ? (
          <Text
            c={style.color}
            fw={700}
            style={{
              fontSize: fontSize(text),
              lineHeight: 1.3,
              whiteSpace: "pre-wrap",
            }}
            ta="center"
          >
            {text}
          </Text>
        ) : (
          <Text c="dimmed" style={{ fontSize: "2rem" }} ta="center">
            {m.display.board.announcement.empty}
          </Text>
        )}
        {showClock && <Clock />}
      </Stack>
    </Center>
  );
}
