"use client";

/**
 * StepProgramsPanel — 工程実行画面の「この工程の加工プログラム」。
 *
 * 指示書が使う図面の版から、この工程を受け持つプログラムだけを出す。
 * 計画・実績の作業場所（= 機械）と一致するものが先頭（並びは
 * lib/design-programs-core.ts programsForStep — 共有端末と同じ規則）。
 * プログラムが 1 本も無ければ何も描かない（図面にプログラムを持たない
 * 工程のほうが多いので、空の枠を毎回見せない）。
 */

import { Anchor, Group, Paper, Stack, Title } from "@mantine/core";
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
        <ProgramsView highlightMatch programs={data.programs} />
      </Stack>
    </Paper>
  );
}
