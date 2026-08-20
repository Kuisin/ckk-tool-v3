"use client";

/**
 * DisplayPreferencesForm — 表示設定（/profile/preferences、本人のみ）。
 *
 * 言語 / 日付形式 / 時刻形式 / タイムゾーンを選ぶ。選んだ内容は保存前に
 * プレビューへ即反映する（設定名だけでは結果が想像しにくいため）。
 *
 * 保存は saveDisplayPreferences（app.users の各列へ）。言語列はキオスクと
 * 共有なので、共有タブレット側の表示も変わる。
 */

import { Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveDisplayPreferences } from "@/app/(dashboard)/profile/preferences/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions } from "@/components/ui/shells";
import { createFormatters } from "@/lib/format";
import { getMessages, LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import {
  COMMON_TIME_ZONES,
  DATE_FORMATS,
  type DateFormat,
  type DisplayPreferences,
  dateFormatExample,
  type Locale,
  type TimeFormat,
} from "@/lib/user-preferences-core";

/** プレビューの基準時刻（固定 — 説明用に「わかりやすい」瞬間を選ぶ）。 */
const SAMPLE_ISO = "2026-03-05T05:30:00.000Z"; // JST 14:30 / UTC 05:30

export function DisplayPreferencesForm({
  initial,
}: {
  initial: DisplayPreferences;
}) {
  const [prefs, setPrefs] = useState<DisplayPreferences>(initial);
  const [isPending, startTransition] = useTransition();

  // 文言もプレビュー対象 — 言語を変えるとこの画面の見出しごと変わる。
  const m = useMemo(() => getMessages(prefs.locale), [prefs.locale]);
  const fmt = useMemo(() => createFormatters(prefs), [prefs]);

  /**
   * タイムゾーンの選択肢には、その地域での**いまの時刻**を添える
   * （"Asia/Shanghai" だけでは日本と何時間ずれるのか分からないため）。
   *
   * 現在時刻はマウント後にだけ入れる — レンダー中に `new Date()` を読むと
   * サーバーとクライアントで値が食い違い、選択中ラベルが hydration 不一致に
   * なる。SSR ではゾーン名だけを出し、マウント後に時刻を足す。
   */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  const timeZoneOptions = useMemo(
    () =>
      COMMON_TIME_ZONES.map((tz) => ({
        value: tz,
        label: now
          ? `${tz}（${createFormatters({ ...prefs, timeZone: tz }).time(now)}）`
          : tz,
      })),
    [prefs, now],
  );

  const set = <K extends keyof DisplayPreferences>(
    key: K,
    value: DisplayPreferences[K] | null,
  ) => {
    if (value == null) return;
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveDisplayPreferences(prefs);
      notifications.show(
        result.ok
          ? {
              title: m.common.saved,
              message: m.preferences.saved,
              color: "green",
            }
          : { title: "エラー", message: result.error, color: "red" },
      );
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[m.shell.profile, m.preferences.title]}
        title={m.preferences.title}
      />

      <Paper p="md" radius="md" shadow="xs">
        <Text c="dimmed" mb="md" size="sm">
          {m.preferences.description}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            allowDeselect={false}
            data={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
            description={m.preferences.languageHelp}
            label={m.preferences.language}
            onChange={(v) => set("locale", v as Locale)}
            value={prefs.locale}
          />
          <Select
            allowDeselect={false}
            data={timeZoneOptions}
            description={m.preferences.timeZoneHelp}
            label={m.preferences.timeZone}
            onChange={(v) => set("timeZone", v)}
            searchable
            value={prefs.timeZone}
          />
          <Select
            allowDeselect={false}
            data={DATE_FORMATS.map((f) => ({
              value: f,
              label: `${f}（${dateFormatExample(f)}）`,
            }))}
            label={m.preferences.dateFormat}
            onChange={(v) => set("dateFormat", v as DateFormat)}
            value={prefs.dateFormat}
          />
          <Select
            allowDeselect={false}
            data={[
              { value: "24h", label: m.preferences.time24h },
              { value: "12h", label: m.preferences.time12h },
            ]}
            label={m.preferences.timeFormat}
            onChange={(v) => set("timeFormat", v as TimeFormat)}
            value={prefs.timeFormat}
          />
        </SimpleGrid>
      </Paper>

      {/* プレビュー — 保存前に「実際どう出るか」を見せる。 */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={5}>
          {m.preferences.preview}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {m.preferences.previewDate}
            </Text>
            <Text fw={500} size="sm">
              {fmt.date(SAMPLE_ISO)}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {m.preferences.previewDateTime}
            </Text>
            <Text fw={500} size="sm">
              {fmt.dateTime(SAMPLE_ISO)}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {m.preferences.previewTime}
            </Text>
            <Text fw={500} size="sm">
              {fmt.time(SAMPLE_ISO)}
            </Text>
          </Stack>
        </SimpleGrid>
      </Paper>

      <FormActions
        loading={isPending}
        onCancel={() => setPrefs(initial)}
        onSave={save}
      />
    </Stack>
  );
}
