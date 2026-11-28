"use client";

/**
 * StepProgramsPanel — 工程実行画面の「この工程の加工プログラム」。
 *
 * 指示書が使う図面の版から、この工程を受け持つプログラムの現行版を出す。
 * 計画・実績の作業場所（= 機械）の機種と一致するものが先頭で「この機種用」
 * （並びは lib/design-programs-core.ts — 共有端末と同じ規則）。
 * **開始済みの工程は、開始したときに記録した版**を出す（あとで新しい版が
 * できても、その工程が何で始めたかは変わらない）。
 * プログラムが 1 本も無ければ何も描かない（図面にプログラムを持たない
 * 工程のほうが多いので、空の枠を毎回見せない）。
 */

import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { StepProgramsView } from "@/lib/design-programs";
import { ProgramsView } from "./DesignProgramsPanel";

export function StepProgramsPanel({ data }: { data: StepProgramsView }) {
  const tr = useTranslations();
  if (!data.version || data.programs.length === 0) return null;
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap">
          <Title order={5}>{tr("production.designPrograms.title")}</Title>
          <Anchor
            href={`/production/design-files/versions/${encodeURIComponent(data.version.id)}`}
            size="sm"
          >
            {tr("production.designPrograms.fromVersion", {
              version: data.version.version,
            })}
          </Anchor>
        </Group>
        {data.fromRecord && (
          <Text c="dimmed" size="xs">
            {tr("production.designPrograms.fromRecord")}
          </Text>
        )}
        <ProgramsView highlightMatch programs={data.programs} />
      </Stack>
    </Paper>
  );
}
