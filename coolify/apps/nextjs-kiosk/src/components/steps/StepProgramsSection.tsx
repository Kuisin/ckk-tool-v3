"use client";

/**
 * StepProgramsSection — 共有端末の工程実行画面「この工程の加工プログラム」。
 *
 * 機械（= 作業場所）の機種が一致するものが先頭で「この機種用」
 * （design-programs-core.ts — Web と同じ規則）。開始済みの工程は開始したときの
 * 版を出す。1 本も無ければ何も描かない。ファイルは
 * /api/kiosk/steps/[stepId]/programs/[programId] から落とす。
 */

import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import type { KioskStepProgram } from "@/lib/design-programs";
import { fillMessage } from "@/lib/i18n";
import { useI18n } from "../I18nProvider";

export function StepProgramsSection({
  stepId,
  programs,
}: {
  stepId: string;
  programs: KioskStepProgram[];
}) {
  const { m } = useI18n();
  if (programs.length === 0) return null;
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Title order={4}>{m.steps.programs.title}</Title>
        {programs.map((p) => (
          <Paper key={p.id} p="sm" radius="sm" withBorder>
            <Stack gap={6}>
              <Group gap="xs" wrap="wrap">
                <Text fw={600}>{p.name}</Text>
                <Badge color="gray" tt="none" variant="outline">
                  {fillMessage(m.steps.programs.revision, {
                    revision: String(p.revision),
                  })}
                </Badge>
                {p.programNumber && (
                  <Text c="dimmed" ff="monospace" size="sm">
                    {p.programNumber}
                  </Text>
                )}
                {p.modelMatch && (
                  <Badge color="green" variant="light">
                    {m.steps.programs.modelMatch}
                  </Badge>
                )}
              </Group>
              <Text c="dimmed" size="sm">
                {fillMessage(m.steps.programs.machineModels, {
                  names:
                    p.machineModelNames.length > 0
                      ? p.machineModelNames.join("、")
                      : m.steps.programs.anyModel,
                })}
              </Text>
              {p.notes && (
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {p.notes}
                </Text>
              )}
              {p.hasFile ? (
                <Button
                  component="a"
                  href={`/api/kiosk/steps/${encodeURIComponent(stepId)}/programs/${encodeURIComponent(p.id)}`}
                  leftSection={<IconDownload size={20} />}
                  size="lg"
                  variant="default"
                >
                  {p.filename ?? m.steps.programs.download}
                </Button>
              ) : (
                <Text c="dimmed" size="sm">
                  {m.steps.programs.noFile}
                </Text>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
