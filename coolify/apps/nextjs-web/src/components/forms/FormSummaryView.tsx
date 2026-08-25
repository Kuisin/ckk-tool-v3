"use client";

/**
 * FormSummaryView — 回答の集計。項目ごとに、その型に合った出し方をする。
 *
 * テキスト項目は**グラフにしない**（同じ文章が並ぶことは無いので、棒にしても
 * 全部 1 件になるだけ）。件数と抜粋を出す。
 */

import { Badge, Card, Group, Paper, Stack, Text } from "@mantine/core";
import { IconChartBar } from "@tabler/icons-react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FORM_FIELD_TYPES } from "@/lib/form-schema";
import type { FieldSummary } from "@/lib/form-summary";
import { StatRow, SummaryBars } from "./SummaryBars";

function typeLabel(type: FieldSummary["type"]): string {
  return FORM_FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

function Body({ summary }: { summary: FieldSummary }) {
  const body = summary.body;

  switch (body.kind) {
    case "categories":
      return (
        <Stack gap="sm">
          <SummaryBars
            items={body.items}
            // 複数選択は 1 回答が複数選ぶので、割合の分母が回答数にならない。
            showPercent={summary.type !== "multiselect"}
            total={body.answered}
          />
          {body.otherCount > 0 && (
            <Text c="dimmed" size="xs">
              ほかに {body.otherCount} 件（上位のみ表示）
            </Text>
          )}
        </Stack>
      );

    case "numbers":
      return (
        <Stack gap="md">
          <StatRow
            stats={[
              { label: "回答", value: body.answered },
              { label: "最小", value: body.min },
              { label: "平均", value: body.mean },
              { label: "中央", value: body.median },
              { label: "最大", value: body.max },
            ]}
          />
          <SummaryBars
            items={body.buckets}
            showPercent={false}
            total={body.answered}
          />
        </Stack>
      );

    case "periods":
      return (
        <SummaryBars
          items={body.buckets}
          showPercent={false}
          total={body.answered}
        />
      );

    case "text":
      return (
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            {body.answered} 件の回答（自由記述はグラフにしません）
          </Text>
          {body.samples.map((sample, i) => (
            <Paper
              // biome-ignore lint/suspicious/noArrayIndexKey: 抜粋は同じ文面が並びうる
              key={i}
              p="xs"
              radius="sm"
              withBorder
            >
              <Text lineClamp={3} size="sm">
                {sample}
              </Text>
            </Paper>
          ))}
        </Stack>
      );

    case "amount":
      return <Text size="sm">{body.note}</Text>;

    default:
      return (
        <Text c="dimmed" size="sm">
          この項目は集計しません（表示専用）
        </Text>
      );
  }
}

export function FormSummaryView({
  formCode,
  formTitle,
  responseCount,
  lastResponseAt,
  summaries,
}: {
  formCode: string;
  formTitle: string;
  responseCount: number;
  lastResponseAt: string | null;
  summaries: FieldSummary[];
}) {
  const fmt = useFormat();

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href={`/general/forms/${formCode}`}>
            フォームへ戻る
          </SecondaryButton>
        }
        breadcrumbs={[
          { label: "一般" },
          { label: "フォーム", href: "/general/forms" },
          { label: formTitle, href: `/general/forms/${formCode}` },
          { label: "集計" },
        ]}
        title={`集計 — ${formTitle}`}
      />

      <Card padding="md" radius="md" withBorder>
        <StatRow
          stats={[
            { label: "回答数", value: responseCount },
            {
              label: "最新の回答",
              value: lastResponseAt ? fmt.dateTime(lastResponseAt) : "—",
            },
          ]}
        />
      </Card>

      {responseCount === 0 ? (
        <Paper p="md" radius="md" withBorder>
          <EmptyState
            icon={<IconChartBar size={28} />}
            message="まだ回答がありません"
          />
        </Paper>
      ) : (
        <Stack gap="md">
          {summaries.map((summary) => (
            <Card key={summary.key} padding="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group gap="xs" wrap="wrap">
                  <Text fw={600} size="sm">
                    {summary.label}
                  </Text>
                  <Badge color="gray" size="xs" variant="light">
                    {typeLabel(summary.type)}
                  </Badge>
                </Group>
                <Body summary={summary} />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
