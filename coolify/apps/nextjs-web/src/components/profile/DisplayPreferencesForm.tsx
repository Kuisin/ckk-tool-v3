"use client";

/**
 * DisplayPreferencesForm — 表示設定（/profile/preferences、本人のみ）。
 *
 * 言語 / 日付形式 / 時刻形式 / タイムゾーン / 文字の大きさ / 文字を太くする、を
 * 選ぶ。選んだ内容は保存前にプレビューへ即反映する（設定名だけでは結果が
 * 想像しにくいため）。
 *
 * ★ 文字の大きさ・太さは**画面全体に**その場で当てる（プレビュー枠の中だけに
 *   当てない）。読めるかどうかは一覧やボタンを含めた画面全体で決まるもので、
 *   小さな見本では判断できないため。保存せずに離れれば元に戻る
 *   （html へ載せた上書きを片付ける）。
 *
 * ★ 言語も保存前に反映したいので、この画面だけ 3 言語ぶんの文言を読み込み、
 *   選択中の言語で `NextIntlClientProvider` を **入れ子**にして自分自身を包む
 *   （next-intl はリクエストの言語で固定されるため）。中身は
 *   PreferencesFormBody で、そこは普通に `useTranslations` を使う。
 *   messages は 1 ファイル数 KB なので、この画面に限れば 3 つ持っても軽い。
 *
 * 保存は saveDisplayPreferences（app.users の各列へ）。言語列はキオスクと
 * 共有なので、共有タブレット側の表示も変わる。
 */

import {
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveDisplayPreferences } from "@/app/(dashboard)/profile/preferences/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions } from "@/components/ui/shells";
import { createFormatters } from "@/lib/format";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import {
  COMMON_TIME_ZONES,
  DATE_FORMATS,
  type DateFormat,
  type DisplayPreferences,
  dateFormatExample,
  displayCssVariables,
  type Locale,
  TEXT_SCALE_FACTORS,
  TEXT_SCALES,
  type TextScale,
  type TimeFormat,
} from "@/lib/user-preferences-core";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import zh from "../../../messages/zh.json";

/** プレビューの基準時刻（固定 — 説明用に「わかりやすい」瞬間を選ぶ）。 */
const SAMPLE_ISO = "2026-03-05T05:30:00.000Z"; // JST 14:30 / UTC 05:30

const PREVIEW_MESSAGES: Record<Locale, typeof ja> = { ja, en, zh };

/** 段 → 文言キー（`t()` にテンプレート文字列を渡すと型検査が効かないため）。 */
const TEXT_SCALE_LABEL_KEYS = {
  xs: "textScaleXs",
  sm: "textScaleSm",
  md: "textScaleMd",
  lg: "textScaleLg",
  xl: "textScaleXl",
} as const satisfies Record<TextScale, string>;

/** 選択中の言語で文言を差し替えるための入れ子プロバイダ。 */
export function DisplayPreferencesForm({
  initial,
}: {
  initial: DisplayPreferences;
}) {
  const [prefs, setPrefs] = useState<DisplayPreferences>(initial);
  return (
    <NextIntlClientProvider
      locale={prefs.locale}
      messages={PREVIEW_MESSAGES[prefs.locale]}
      timeZone={prefs.timeZone}
    >
      <PreferencesFormBody
        initial={initial}
        onChange={setPrefs}
        prefs={prefs}
      />
    </NextIntlClientProvider>
  );
}

function PreferencesFormBody({
  initial,
  prefs,
  onChange,
}: {
  initial: DisplayPreferences;
  prefs: DisplayPreferences;
  onChange: (next: DisplayPreferences) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("preferences");
  const tc = useTranslations("common");
  const tShell = useTranslations("shell");

  const fmt = useMemo(() => createFormatters(prefs), [prefs]);

  /**
   * タイムゾーンの選択肢には、その地域での**いまの時刻**を添える
   * （"Asia/Shanghai" だけでは日本と何時間ずれるのか分からないため）。
   *
   * 時刻を出すのは**開いたときの一覧だけ**で、閉じた入力欄はゾーン名だけに
   * する。理由は 2 つ:
   *   - 選択済みの欄に時計が入っていると、設定値なのか現在時刻なのか紛らわしい
   *   - 欄の中身が毎分変わるとマニュアルのスクリーンショットが決定的にならない
   *     （撮影のたびに差分が出る）
   *
   * 現在時刻はマウント後にだけ読む — レンダー中に `new Date()` を読むと
   * サーバーとクライアントで値が食い違い hydration 不一致になる。
   */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  /**
   * 選んだ文字の大きさ・太さを画面全体へ即反映する。
   *
   * html の inline style は、サーバーが :root へ流し込んだ `<style>` より強い
   * ので上書きになる。片付ける（removeProperty）と保存済みの値へ戻るので、
   * 保存せずに他の画面へ移った場合も設定は変わらない。
   */
  useEffect(() => {
    const root = document.documentElement;
    const vars = displayCssVariables(prefs);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
    };
  }, [prefs]);
  const timeZoneOptions = useMemo(
    () => COMMON_TIME_ZONES.map((tz) => ({ value: tz, label: tz })),
    [],
  );
  const zoneTime = (tz: string): string | null =>
    now ? createFormatters({ ...prefs, timeZone: tz }).time(now) : null;

  const set = <K extends keyof DisplayPreferences>(
    key: K,
    value: DisplayPreferences[K] | null,
  ) => {
    if (value == null) return;
    onChange({ ...prefs, [key]: value });
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveDisplayPreferences(prefs);
      notifications.show(
        result.ok
          ? {
              title: tc("saved"),
              message: t("saved"),
              color: "green",
            }
          : { title: tc("error"), message: result.error, color: "red" },
      );
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tShell("profile"), t("title")]}
        title={t("title")}
      />

      <Paper p="md" radius="md" shadow="xs">
        <Text c="dimmed" mb="md" size="sm">
          {t("description")}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            allowDeselect={false}
            data={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
            description={t("languageHelp")}
            label={t("language")}
            onChange={(v) => set("locale", v as Locale)}
            value={prefs.locale}
          />
          <Select
            allowDeselect={false}
            data={timeZoneOptions}
            description={t("timeZoneHelp")}
            label={t("timeZone")}
            onChange={(v) => set("timeZone", v)}
            renderOption={({ option }) => (
              <Group gap="xs" justify="space-between" w="100%" wrap="nowrap">
                <span>{option.label}</span>
                {zoneTime(option.value) && (
                  <Text c="dimmed" size="xs">
                    {zoneTime(option.value)}
                  </Text>
                )}
              </Group>
            )}
            searchable
            value={prefs.timeZone}
          />
          <Select
            allowDeselect={false}
            data={DATE_FORMATS.map((f) => ({
              value: f,
              label: `${f}（${dateFormatExample(f)}）`,
            }))}
            label={t("dateFormat")}
            onChange={(v) => set("dateFormat", v as DateFormat)}
            value={prefs.dateFormat}
          />
          <Select
            allowDeselect={false}
            data={[
              { value: "24h", label: t("time24h") },
              { value: "12h", label: t("time12h") },
            ]}
            label={t("timeFormat")}
            onChange={(v) => set("timeFormat", v as TimeFormat)}
            value={prefs.timeFormat}
          />
        </SimpleGrid>
      </Paper>

      {/*
        文字の大きさ・太さ。選択肢のラベルは**その段の大きさで**描く
        （「大」と書いてあるより、大きい字で「大」と出ているほうが早い）。
      */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={5}>
          {t("textSize")}
        </Title>
        <Text c="dimmed" mb="sm" size="sm">
          {t("textSizeHelp")}
        </Text>
        <SegmentedControl
          data={TEXT_SCALES.map((scale) => ({
            value: scale,
            label: (
              <span
                style={{
                  fontSize: `calc(var(--mantine-font-size-sm) * ${TEXT_SCALE_FACTORS[scale]})`,
                }}
              >
                {t(TEXT_SCALE_LABEL_KEYS[scale])}
              </span>
            ),
          }))}
          fullWidth
          onChange={(value) => set("textScale", value as TextScale)}
          value={prefs.textScale}
        />
        <Divider my="md" />
        <Switch
          checked={prefs.boldText}
          description={t("boldTextHelp")}
          label={t("boldText")}
          onChange={(event) => set("boldText", event.currentTarget.checked)}
        />
      </Paper>

      {/* プレビュー — 保存前に「実際どう出るか」を見せる。 */}
      <Paper p="md" radius="md" shadow="xs">
        <Title mb="xs" order={5}>
          {t("preview")}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {t("previewDate")}
            </Text>
            <Text fw={500} size="sm">
              {fmt.date(SAMPLE_ISO)}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {t("previewDateTime")}
            </Text>
            <Text fw={500} size="sm">
              {fmt.dateTime(SAMPLE_ISO)}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              {t("previewTime")}
            </Text>
            <Text fw={500} size="sm">
              {fmt.time(SAMPLE_ISO)}
            </Text>
          </Stack>
        </SimpleGrid>
        <Divider my="sm" />
        {/* 本文の見本 — 大きさと太さは画面全体に効いているので、ここは
            「まとまった文章だとどう見えるか」を確かめるためだけに置く。 */}
        <Stack gap={2}>
          <Text c="dimmed" size="xs">
            {t("previewText")}
          </Text>
          <Text size="sm">{t("previewTextSample")}</Text>
        </Stack>
      </Paper>

      <FormActions
        loading={isPending}
        onCancel={() => onChange(initial)}
        onSave={save}
      />
    </Stack>
  );
}
