"use client";

/**
 * FormSummaryView — 回答の集計。項目ごとに、その型に合った出し方をする。
 *
 * 形の選び方（Google フォーム / Microsoft Forms と同じ考え方。判断は
 * SummaryCharts の冒頭に書いてある）:
 *   1 つ選ぶ（ドロップダウン・業務データ検索）… 構成 → ドーナツ
 *   複数選ぶ                                    … 部分の和が全体を超える → 横棒
 *   数値                                        … 分布 → 代表値 + 縦棒
 *   日付・時刻                                  … 推移 → 縦棒（左から右へ）
 *   自由記述                                    … **グラフにしない**（件数と抜粋）
 *   添付・サブテーブル                          … 量だけ
 *
 * 狭い画面では縦棒をやめて横棒に落とす。1 本が数 px になると、棒の長短ではなく
 * 隙間を見比べることになって読めない。
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
  IconBook2,
  IconChartBar,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useIsMobile } from "@/hooks/useViewport";
import { downloadCsv, toCsv } from "@/lib/csv";
import { FORM_FIELD_TYPES } from "@/lib/form-schema";
import type { CountItem, FieldSummary } from "@/lib/form-summary";
import { StatRow, SummaryBars } from "./SummaryBars";
import { ColumnChart, DonutChart, MAX_DONUT_SLICES } from "./SummaryCharts";

/** 選択肢のグラフの出し方。`auto` は区分の数で決める。 */
export type ChartMode = "auto" | "pie" | "bar";

function typeLabel(type: FieldSummary["type"]): string {
  return FORM_FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** 1 つだけ選ぶ質問か（＝部分の和が全体になる質問か）。 */
function isSingleChoice(type: FieldSummary["type"]): boolean {
  return type === "select" || type === "lookup";
}

function Body({
  summary,
  chartMode,
  isMobile,
}: {
  summary: FieldSummary;
  chartMode: ChartMode;
  isMobile: boolean;
}) {
  const tr = useTranslations();
  const body = summary.body;

  switch (body.kind) {
    case "categories": {
      const drawn = body.items.filter((i) => i.count > 0).length;
      // ドーナツにしてよいのは「1 人が 1 つだけ選ぶ」質問だけ。複数選べる
      // 質問で円を描くと、面積の合計が回答数を超えて割合が嘘になる。
      // 上位打ち切り（otherCount > 0）のときも円にしない — 全体が欠けた円は
      // 「これで全部」に見えてしまう。
      const canDonut =
        isSingleChoice(summary.type) &&
        body.otherCount === 0 &&
        drawn >= 2 &&
        drawn <= MAX_DONUT_SLICES;
      // 「棒」を選んだときだけ円をやめる。「円」は**できるものだけ**円にする
      // 指示であって、できないものを無理に円にする指示ではない。
      const donut = canDonut && chartMode !== "bar";

      return (
        <Stack gap="sm">
          {donut ? (
            <DonutChart
              items={body.items.filter((i) => i.count > 0)}
              total={body.answered}
            />
          ) : (
            <SummaryBars
              items={body.items}
              // 複数選択は 1 回答が複数選ぶので合計が回答数を超える。それでも
              // 「回答した人のうち何 % が選んだか」は読みたい数字なので、
              // 分母が何かを下に書いたうえで出す。
              showPercent
              total={body.answered}
            />
          )}
          {summary.type === "multiselect" && (
            <Text c="dimmed" size="xs">
              割合は回答した {body.answered} 件に対するもの（複数選べるので
              合計は 100% を超えます）
            </Text>
          )}
          {body.otherCount > 0 && (
            <Text c="dimmed" size="xs">
              ほかに {body.otherCount} 件（上位のみ表示）
            </Text>
          )}
          {chartMode === "pie" && !canDonut && (
            <Text c="dimmed" size="xs">
              {tr("forms.formSummaryView.thisFieldCannotBeAPie")}
            </Text>
          )}
        </Stack>
      );
    }

    case "numbers":
      return (
        <Stack gap="md">
          <StatRow
            stats={[
              { label: tr("common.response"), value: body.answered },
              { label: tr("forms.formSummaryView.smallest"), value: body.min },
              { label: tr("forms.formSummaryView.average"), value: body.mean },
              { label: tr("forms.formSummaryView.center"), value: body.median },
              { label: tr("forms.formSummaryView.largest"), value: body.max },
            ]}
          />
          {isMobile ? (
            <SummaryBars
              items={body.buckets}
              showPercent={false}
              total={body.answered}
            />
          ) : (
            <ColumnChart items={body.buckets} />
          )}
        </Stack>
      );

    case "periods":
      // 日付・時刻は左から右へ流れるほうが読める（並びに意味がある）。
      return isMobile ? (
        <SummaryBars
          items={body.buckets}
          showPercent={false}
          total={body.answered}
        />
      ) : (
        <ColumnChart items={body.buckets} />
      );

    case "text":
      return (
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            自由記述はグラフにしません。最近の回答を{body.samples.length}
            件まで並べます。
          </Text>
          {body.samples.map((sample, i) => (
            <Paper
              // biome-ignore lint/suspicious/noArrayIndexKey: 抜粋は同じ文面が並びうる
              key={i}
              p="xs"
              radius="sm"
              withBorder
            >
              {/* 改行をそのまま出す。潰すと箇条書きで書かれた回答が読めない。 */}
              <Text
                lineClamp={4}
                size="sm"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {sample}
              </Text>
            </Paper>
          ))}
          {body.answered > body.samples.length && (
            <Text c="dimmed" size="xs">
              ほかに {body.answered - body.samples.length} 件（すべて読むには
              回答一覧か Excel の書き出しへ）
            </Text>
          )}
        </Stack>
      );

    case "amount":
      return <Text size="sm">{body.note}</Text>;

    default:
      return (
        <Text c="dimmed" size="sm">
          {tr("forms.formSummaryView.thisFieldIsNotSummarizedDisplay")}
        </Text>
      );
  }
}

/** 回答 / 未回答の件数。必須でない質問では「答えなかった」ことも結果。 */
function AnsweredCount({ summary }: { summary: FieldSummary }) {
  const body = summary.body;
  if (body.kind === "none") return null;
  const answered = body.answered;
  const unanswered = Math.max(0, summary.total - answered);
  return (
    <Text c="dimmed" size="xs" style={{ marginLeft: "auto" }}>
      回答 {answered}
      {unanswered > 0 ? ` / 未回答 ${unanswered}` : ""}
    </Text>
  );
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
  chartMode,
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
  chartMode: ChartMode;
  /** 未設定なら Metabase へのリンクは出さない（LAN 限定の URL を焼き込まない）。 */
  metabaseUrl: string | null;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();

  // 表示の切り替えは URL に持たせる（共有したときに同じ見え方で開ける）。
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // 集計そのものを CSV で出す（画面の数字をそのまま持ち出せるように）。
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [tr("common.item"), tr("common.type"), tr("forms.formSummaryView.count")],
    ];
    for (const s of summaries) {
      const b = s.body;
      if (b.kind === "categories" || b.kind === "periods") {
        const items = b.kind === "categories" ? b.items : b.buckets;
        for (const i of items) rows.push([s.label, i.label, i.count]);
      } else if (b.kind === "numbers") {
        rows.push([s.label, tr("common.responses"), b.answered]);
        rows.push([s.label, tr("forms.formSummaryView.smallest"), b.min]);
        rows.push([s.label, tr("forms.formSummaryView.average"), b.mean]);
        rows.push([s.label, tr("forms.formSummaryView.center"), b.median]);
        rows.push([s.label, tr("forms.formSummaryView.largest"), b.max]);
        for (const i of b.buckets) rows.push([s.label, i.label, i.count]);
      } else if (b.kind === "text" || b.kind === "amount") {
        rows.push([s.label, tr("common.responses"), b.answered]);
      }
      if (b.kind !== "none")
        rows.push([
          s.label,
          tr("forms.formSummaryView.noAnswer"),
          Math.max(0, s.total - b.answered),
        ]);
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
              {tr("forms.formSummaryView.backToTheForm")}
            </SecondaryButton>
          </Group>
        }
        breadcrumbs={[
          { label: tr("common.general") },
          { label: tr("common.forms"), href: "/general/forms" },
          { label: formTitle, href: `/general/forms/${formCode}` },
          { label: tr("forms.formSummaryView.summary") },
        ]}
        title={`集計 — ${formTitle}`}
      />

      <Card padding="md" radius="md" withBorder>
        <StatRow
          stats={[
            { label: tr("common.responses"), value: responseCount },
            {
              label: tr("forms.formSummaryView.latestResponse"),
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
                  {tr("forms.formSummaryView.optionOrder")}
                </Text>
                <SegmentedControl
                  data={[
                    {
                      value: "count",
                      label: tr("forms.formSummaryView.mostFirst"),
                    },
                    {
                      value: "definition",
                      label: tr("forms.formSummaryView.definitionOrder"),
                    },
                  ]}
                  onChange={(v) => setParam("order", v)}
                  size="xs"
                  value={order}
                />
              </Stack>
              <Stack gap={4}>
                <Text c="dimmed" size="xs">
                  {tr("forms.formSummaryView.optionChart")}
                </Text>
                <SegmentedControl
                  data={[
                    {
                      value: "auto",
                      label: tr("forms.formSummaryView.automatic"),
                    },
                    { value: "pie", label: tr("forms.formSummaryView.jPY") },
                    { value: "bar", label: tr("forms.formSummaryView.bar") },
                  ]}
                  onChange={(v) => setParam("chart", v)}
                  size="xs"
                  value={chartMode}
                />
              </Stack>
              <Stack gap={4}>
                <Text c="dimmed" size="xs">
                  {tr("forms.formSummaryView.howDatesAreGrouped")}
                </Text>
                <SegmentedControl
                  data={[
                    {
                      value: "month",
                      label: tr("forms.formSummaryView.byMonth"),
                    },
                    { value: "day", label: tr("forms.formSummaryView.byDay") },
                  ]}
                  onChange={(v) => setParam("grain", v)}
                  size="xs"
                  value={dateGrain}
                />
              </Stack>
            </Group>
            <Stack gap={4}>
              <Text fw={600} size="sm">
                {tr("forms.formSummaryView.submissionsOverTime")}
              </Text>
              {isMobile ? (
                <SummaryBars
                  items={trend}
                  showPercent={false}
                  total={responseCount}
                />
              ) : (
                <ColumnChart items={trend} />
              )}
            </Stack>
          </Stack>
        </Card>
      )}

      <Alert
        color="gray"
        icon={<IconChartBar size={16} />}
        title={tr("forms.formSummaryView.toAnalyseThisInMoreDepth")}
        variant="light"
      >
        <Stack gap="xs">
          <Text size="sm">
            {tr("forms.formSummaryView.thisScreenGoesOnlyAsFar")}
            <strong> Metabase </strong>
            {tr("forms.formSummaryView.isWhereYouDoIt")}
            <br />
            フォームの回答は{" "}
            <Text component="span" ff="mono" size="sm">
              analytics.v_form_answers
            </Text>{" "}
            に「1 行 = 1 回答 × 1 項目」で入っています。項目名で内訳を出し、
            フォームコードで絞るだけで集計できます。
          </Text>

          {/* Metabase の「フォームコード」フィルタに貼る値。手で書き写すと
              打ち間違えるので、そのままコピーできる形で出す。 */}
          <CopyableValue
            description={tr("forms.formSummaryView.pasteItIntoMetabaseSForm")}
            label={tr("common.formCode")}
            value={formCode}
          />

          <Group gap="xs">
            {metabaseUrl && (
              <SecondaryButton
                external
                href={metabaseUrl}
                leftSection={<IconExternalLink size={14} />}
              >
                {tr("forms.formSummaryView.openMetabase")}
              </SecondaryButton>
            )}
            <SecondaryButton
              external
              href="/manual/ja/operations/general/forms/user#metabase"
              leftSection={<IconBook2 size={14} />}
            >
              {tr("forms.formSummaryView.readHowItIsSummarized")}
            </SecondaryButton>
          </Group>
        </Stack>
      </Alert>

      {responseCount === 0 ? (
        <Paper p="md" radius="md" withBorder>
          <EmptyState
            icon={<IconChartBar size={28} />}
            message={tr("common.noResponsesYet")}
          />
        </Paper>
      ) : (
        <Stack gap="md">
          {summaries.map((summary) => (
            <Card key={summary.key} padding="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group gap="xs" wrap="nowrap">
                  <Text fw={600} size="sm" style={{ minWidth: 0 }}>
                    {summary.label}
                  </Text>
                  <Badge color="gray" size="xs" variant="light">
                    {typeLabel(summary.type)}
                  </Badge>
                  <AnsweredCount summary={summary} />
                </Group>
                <Body
                  chartMode={chartMode}
                  isMobile={isMobile}
                  summary={summary}
                />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
