"use client";

/**
 * UserMenu — ヘッダーの利用者名を押すと開く設定の窓。
 *
 * これまで**ログアウトと言語はランチャー画面にしか無かった**。工程実行の
 * 途中で切り替えたい / 交代したいときに、いちいちアプリ一覧まで戻る必要が
 * あった。ヘッダーは全画面に出ているので、ここに置けばどこからでも届く。
 *
 * 中身:
 *   文字の大きさ … users.text_scale（**nextjs-web と同じ列**）。Web で決めた
 *                  設定がそのまま付いてくるし、ここで変えれば Web にも効く
 *   言語         … users.locale（従来どおり）
 *   ログアウト   … 従来どおり
 *
 * ★ **押しやすさを優先する。** 手袋で触る現場のタブレットなので、項目は
 *   大きく、間隔を空ける。文字の大きさは押した瞬間に反映して（保存を待たない）、
 *   結果を見ながら選べるようにする。
 */

import {
  Box,
  Button,
  Divider,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconLogout, IconUserCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import { playLogoutSound } from "@/lib/sound";
import {
  TEXT_SCALE_FACTORS,
  TEXT_SCALES,
  type TextScale,
} from "@/lib/text-scale";

export function UserMenu({
  userName,
  textScale,
}: {
  userName: string;
  textScale: TextScale;
}) {
  const router = useRouter();
  const { locale, m } = useI18n();
  const [opened, setOpened] = useState(false);
  const [scale, setScale] = useState<TextScale>(textScale);
  const [busy, setBusy] = useState(false);

  /**
   * 押した瞬間に画面へ反映してから保存する。保存を待つと、押しても何も
   * 起きない間があり「効いていない」と思って何度も押すことになる。
   */
  const changeScale = async (value: string) => {
    const next = value as TextScale;
    setScale(next);
    document.documentElement.style.setProperty(
      "--app-text-scale",
      String(TEXT_SCALE_FACTORS[next]),
    );
    try {
      await fetch("/api/kiosk/text-scale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textScale: next }),
      });
    } catch {
      // 保存に失敗しても見た目は変わったまま。次の描画でサーバー値へ戻る
    }
  };

  const changeLocale = async (value: string) => {
    if (value === locale || busy) return;
    setBusy(true);
    try {
      await fetch("/api/kiosk/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    playLogoutSound();
    setBusy(true);
    try {
      await fetch("/api/kiosk/session", { method: "DELETE" });
    } finally {
      setOpened(false);
      router.replace("/login");
      router.refresh(); // ヘッダーの名前を捨てさせる（layout は使い回される）
    }
  };

  return (
    <Popover
      onChange={setOpened}
      opened={opened}
      position="bottom-start"
      shadow="md"
      width={340}
      withinPortal
    >
      <Popover.Target>
        <UnstyledButton
          aria-label={m.userMenu.title}
          onClick={() => setOpened((v) => !v)}
          style={{ minWidth: 0 }}
        >
          <Group gap="xs" wrap="nowrap">
            <IconUserCircle color="var(--mantine-color-blue-4)" size={26} />
            <Text fw={600} maw={280} size="md" truncate>
              {userName}
            </Text>
          </Group>
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="md">
          <Box>
            <Text c="dimmed" size="xs">
              {m.userMenu.title}
            </Text>
            <Text fw={600} size="lg" truncate>
              {userName}
            </Text>
          </Box>

          <Divider />

          <Stack gap="xs">
            <Text fw={600} size="sm">
              {m.userMenu.textSize}
            </Text>
            <SegmentedControl
              aria-label={m.userMenu.textSize}
              data={TEXT_SCALES.map((s) => ({
                value: s,
                label: m.textScale[s],
              }))}
              fullWidth
              onChange={changeScale}
              size="md"
              value={scale}
            />
          </Stack>

          <Stack gap="xs">
            <Text fw={600} size="sm">
              {m.userMenu.language}
            </Text>
            <SegmentedControl
              aria-label={m.userMenu.language}
              data={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
              disabled={busy}
              fullWidth
              onChange={changeLocale}
              size="md"
              value={locale}
            />
          </Stack>

          <Divider />

          <Button
            color="red"
            fullWidth
            leftSection={<IconLogout size={20} />}
            loading={busy}
            onClick={logout}
            size="md"
            variant="light"
          >
            {m.userMenu.logout}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
