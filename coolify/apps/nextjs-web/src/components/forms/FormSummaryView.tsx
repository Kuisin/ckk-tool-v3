"use client";

/**
 * FormSummaryView — 回答の集計。項目ごとに、その型に合った出し方をする。
 *
 * テキスト項目は**グラフにしない**（同じ文章が並ぶことは無いので、棒にしても
 * 全部 1 件になるだけ）。件数と抜粋を出す。
 */

import {
  Alert,
  Badge,
  Card,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconChartBar,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadCsv, toCsv } from "@/lib/csv";
import { FORM_FIELD_TYPES } from "@/lib/form-schema";
import type { CountItem, FieldSummary } from "@/lib/form-summary";
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
  trend,
  order,
  dateGrain,
  metabaseUrl,
}: {
  formCode: string;
  formTitle: string;
  responseCount: number;
  lastResponseAt: string | null;
  summaries: FieldSummary[];
  /** 提出の推移（フォーム全体の件数）。 */
  trend: CountItem[];
  order: "count" | "definition";
  dateGrain: "month" | "day";
  /** 未設定なら Metabase へのリンクは出さない（LAN 限定の URL を焼き込まない）。 */
  metabaseUrl: string | null;
}) {
  const fmt = useFormat();
  const router = useRouter();
  const params = useSearchParams();

  // 表示の切り替えは URL に持たせる（共有したときに同じ見え方で開ける）。
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // 集計そのものを CSV で出す（画面の数字をそのまま持ち出せるように）。
  const exportCsv = () => {
    const rows: (string | number)[][] = [["項目", "区分", "件数"]];
    for (const s of summaries) {
      const b = s.body;
      if (b.kind === "categories" || b.kind === "periods") {
        const items = b.kind === "categories" ? b.items : b.buckets;
        for (const i of items) rows.push([s.label, i.label, i.count]);
      } else if (b.kind === "numbers") {
        rows.push([s.label, "回答数", b.answered]);
        rows.push([s.label, "最小", b.min]);
        rows.push([s.label, "平均", b.mean]);
        rows.push([s.label, "中央", b.median]);
        rows.push([s.label, "最大", b.max]);
        for (const i of b.buckets) rows.push([s.label, i.label, i.count]);
      } else if (b.kind === "text" || b.kind === "amount") {
        rows.push([s.label, "回答数", b.answered]);
      }
    }
    downloadCsv(`集計_${formTitle}_${formCode}.csv`, toCsv(rows));
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <Group gap="xs" wrap="nowrap">
            <GhostButton
              leftSection={<IconDownload size={14} />}
              onClick={exportCsv}
            >
              CSV
            </GhostButton>
            <SecondaryButton href={`/general/forms/${formCode}`}>
              フォームへ戻る
            </SecondaryButton>
          </Group>
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

      {responseCount > 0 && (
        <Card padding="md" radius="md" withBorder>
          <Stack gap="sm">
            <Group gap="xl" wrap="wrap">
              <Stack gap={4}>
                <Text c="dimmed" size="xs">
                  選択肢の並び
                </Text>
                <SegmentedControl
                  data={[
                    { value: "count", label: "多い順" },
                    { value: "definition", label: "定義順" },
                  ]}
                  onChange={(v) => setParam("order", v)}
                  size="xs"
                  value={order}
                />
              </Stack>
              <Stack gap={4}>
                <Text c="dimmed" size="xs">
                  日付のまとめ方
                </Text>
                <SegmentedControl
                  data={[
                    { value: "month", label: "月別" },
                    { value: "day", label: "日別" },
                  ]}
                  onChange={(v) => setParam("grain", v)}
                  size="xs"
                  value={dateGrain}
                />
              </Stack>
            </Group>
            <Stack gap={4}>
              <Text fw={600} size="sm">
                提出の推移
              </Text>
              <SummaryBars
                items={trend}
                showPercent={false}
                total={responseCount}
              />
            </Stack>
          </Stack>
        </Card>
      )}

      <Alert
        color="gray"
        icon={<IconChartBar size={16} />}
        title="もっと詳しく分析するには"
        variant="light"
      >
        <Stack gap="xs">
          <Text size="sm">
            この画面は「何がどれだけ選ばれたか」までです。項目どうしの掛け合わせ、
            期間の比較、他の業務データ（受注・出荷など）との突き合わせは
            <strong> Metabase </strong>で行えます。
            <br />
            フォームの回答は{" "}
            <Text component="span" ff="mono" size="sm">
              analytics.v_form_answers
            </Text>{" "}
            に「1 行 = 1 回答 × 1 項目」で入っています。項目名で内訳を出し、
            フォーム名で絞るだけで集計できます。
          </Text>
          {metabaseUrl && (
            <Group>
              <SecondaryButton
                external
                href={metabaseUrl}
                leftSection={<IconExternalLink size={14} />}
              >
                Metabase を開く
              </SecondaryButton>
            </Group>
          )}
        </Stack>
      </Alert>

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
