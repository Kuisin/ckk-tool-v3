"use client";

/**
 * FormResponseView — 提出済みの回答を読む。
 *
 * 描くのは「回答した時点のバージョンの項目」— あとから項目を消しても、
 * その回答は元の形のまま読める。lookup はリンクにする（kintone の商談メモで
 * 会社名・工場名が青字リンクになっているのと同じ役割）。
 *
 * 回答者は props に入っていなければ出さない。respondentVisibility=HIDDEN の
 * フォームではサーバ側で null にしてある。**ここで描くのは answers と related
 * だけ** — 回答者やアップロード者をこの画面に足さないこと。
 *
 * **器の決め方は lib/form-answer-display.ts が持つ**（PDF と共有）。以前は
 * ここだけが型の分岐を持っていたので、画面と帳票で同じ回答が違って見えた。
 *
 * 型ごとの見せ方:
 *   1 行もの        … ラベル + 値（数値は桁区切り、日付・時刻は表示設定の形）
 *   選択            … バッジ（1 つでも複数でも同じ見え方にする）
 *   複数行・リッチ  … **枠で囲んだ高さの変わる本文**。改行をそのまま出す
 *   サブテーブル    … PC は表、スマホは 1 行 = 1 カード（design.md §20.2）
 *   関連レコード    … 同上
 */

import { Anchor, Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { RichTextView } from "@/components/ui/RichTextView";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import {
  answerShape,
  attachmentCount,
  formatNumberAnswer,
  isBlankAnswer,
  selectedLabels,
  tableRows,
} from "@/lib/form-answer-display";
import type { FormAnswerValue, FormFieldDef } from "@/lib/form-schema";
import { lookupHref } from "@/lib/form-schema";
import type { Formatters } from "@/lib/format";
import { formatCalendarDate, formatClockTime } from "@/lib/format";
import type { RichTextDoc } from "@/lib/rich-text-core";

export interface RelatedTable {
  headers: string[];
  rows: { number: string; cells: string[] }[];
}

/**
 * 本文の枠の最低の高さ。複数行・リッチテキストは「長く書いてよい欄」なので、
 * 中身が 1 行でも器の大きさで型が伝わるようにする（1 行テキストと同じ見え方に
 * なっていると、読む側は改行が消えたのか元から 1 行なのか判らない）。
 */
const LONG_ANSWER_MIN_HEIGHT = 64;

const EmptyValue = (
  <Text c="dimmed" size="sm">
    —
  </Text>
);

/** 表 1 行分をスマホ向けに縦へ積む。table / related の両方が使う。 */
function RowCard({
  heading,
  pairs,
}: {
  heading?: React.ReactNode;
  pairs: { label: string; value: React.ReactNode }[];
}) {
  return (
    <Paper p="sm" radius="sm" withBorder>
      <Stack gap={6}>
        {heading}
        {pairs.map((pair) => (
          <Stack gap={2} key={pair.label}>
            <Text c="dimmed" size="xs">
              {pair.label}
            </Text>
            <Text component="div" size="sm">
              {pair.value}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

/** 高さが中身で決まる本文の枠。 */
function AnswerBox({ children }: { children: React.ReactNode }) {
  return (
    <Paper mih={LONG_ANSWER_MIN_HEIGHT} p="sm" radius="sm" withBorder>
      {children}
    </Paper>
  );
}

function LookupValue({
  field,
  value,
}: {
  field: FormFieldDef;
  value: { id: string; label: string };
}) {
  const href = field.lookup ? lookupHref(field.lookup.source, value.id) : null;
  if (!href) return <>{value.label}</>;
  return (
    <Anchor component={Link} href={href} size="sm">
      {value.label}
    </Anchor>
  );
}

function ChoiceBadges({ labels }: { labels: string[] }) {
  return (
    <Group gap={4} wrap="wrap">
      {labels.map((label) => (
        <Badge color="gray" key={label} variant="light">
          {label}
        </Badge>
      ))}
    </Group>
  );
}

/** サブテーブル 1 つ。PC は表、スマホはカード。 */
function SubTable({
  columns,
  rows,
  isMobile,
  fmt,
}: {
  columns: FormFieldDef[];
  rows: Record<string, FormAnswerValue>[];
  isMobile: boolean;
  fmt: Formatters;
}) {
  if (isMobile) {
    return (
      <Stack gap="sm">
        {rows.map((row, i) => (
          <RowCard
            heading={
              <Text c="dimmed" size="xs">
                {i + 1} 行目
              </Text>
            }
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            key={i}
            pairs={columns.map((c) => ({
              label: c.label.ja || c.key,
              value: renderValue(c, row[c.key], isMobile, fmt),
            }))}
          />
        ))}
      </Stack>
    );
  }
  return (
    <Table.ScrollContainer minWidth={Math.max(360, columns.length * 160)}>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={c.key}>{c.label.ja || c.key}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            <Table.Tr key={i}>
              {columns.map((c) => (
                <Table.Td key={c.key}>
                  {renderValue(c, row[c.key], isMobile, fmt)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/**
 * 値 1 つの中身（枠は呼び出し側が決める）。サブテーブルの列からも再帰で呼ぶ
 * ので、ここでは器を作らない。
 */
function renderValue(
  field: FormFieldDef,
  value: FormAnswerValue,
  isMobile: boolean,
  fmt: Formatters,
): React.ReactNode {
  if (isBlankAnswer(field.type, value)) return EmptyValue;

  switch (field.type) {
    case "richtext":
      return <RichTextView doc={value as unknown as RichTextDoc} />;

    case "textarea":
      // 改行と連続空白をそのまま出す。ここが無かったので、複数行の回答が
      // 1 行に潰れて読めなかった。
      return (
        <Text
          component="div"
          size="sm"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {String(value)}
        </Text>
      );

    case "number":
      return (
        <Text className="tabular-nums" component="div" fw={500} size="sm">
          {formatNumberAnswer(value)}
        </Text>
      );

    case "date":
      return formatCalendarDate(String(value), fmt.prefs.dateFormat);

    case "time":
      return formatClockTime(String(value), fmt.prefs.timeFormat);

    case "lookup":
      return typeof value === "object" && value !== null && "id" in value ? (
        <LookupValue
          field={field}
          value={value as { id: string; label: string }}
        />
      ) : (
        EmptyValue
      );

    case "select":
    case "multiselect": {
      const labels = selectedLabels(field, value);
      return labels.length ? <ChoiceBadges labels={labels} /> : EmptyValue;
    }

    case "attachment": {
      // 添付は回答の値として保存されない（「添付」タブで扱う）。それでも
      // 値が入っている古い回答があり得るので、**生の ID は絶対に出さない**。
      const count = attachmentCount(value);
      return count > 0 ? (
        <Text c="dimmed" size="sm">
          {count} 件のファイル
        </Text>
      ) : (
        EmptyValue
      );
    }

    case "table": {
      const rows = tableRows(value);
      const columns = field.columns ?? [];
      if (rows.length === 0) return EmptyValue;
      return (
        <SubTable columns={columns} fmt={fmt} isMobile={isMobile} rows={rows} />
      );
    }

    default:
      return typeof value === "string" ? value : String(value);
  }
}

/** related 項目（参照先フォームの回答一覧）。 */
function RelatedRecords({
  table,
  isMobile,
}: {
  table: RelatedTable | undefined;
  isMobile: boolean;
}) {
  const tr = useTr();
  if (!table || table.rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("参照するレコードがありません。")}
      </Text>
    );
  }
  if (isMobile) {
    return (
      <Stack gap="sm">
        {table.rows.map((r) => (
          <RowCard
            heading={
              <Text c="dimmed" ff="mono" size="xs">
                {r.number}
              </Text>
            }
            key={r.number}
            pairs={table.headers.map((h, i) => ({
              label: h,
              value: r.cells[i] || "—",
            }))}
          />
        ))}
      </Stack>
    );
  }
  return (
    <Table.ScrollContainer minWidth={Math.max(420, table.headers.length * 160)}>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 180 }}>{tr("番号")}</Table.Th>
            {table.headers.map((h) => (
              <Table.Th key={h}>{h}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {table.rows.map((r) => (
            <Table.Tr key={r.number}>
              <Table.Td>
                <Text ff="mono" size="xs">
                  {r.number}
                </Text>
              </Table.Td>
              {r.cells.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 列順が同一性
                <Table.Td key={i}>{c || "—"}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** 項目 1 つ = ラベル + 器 + 値。 */
function AnswerField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={4}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

export function FormResponseView({
  fields,
  answers,
  related,
}: {
  fields: FormFieldDef[];
  answers: Record<string, FormAnswerValue>;
  /** related 項目の中身（サーバ側で権限を見て解決済み）。 */
  related: Record<string, RelatedTable>;
}) {
  const isMobile = useIsMobile();
  const fmt = useFormat();

  return (
    <Stack gap="md">
      {fields.map((field) => {
        const label = field.label.ja || field.key;

        if (field.type === "related") {
          return (
            <AnswerField key={field.key} label={label}>
              <AnswerBox>
                <RelatedRecords
                  isMobile={isMobile}
                  table={related[field.key]}
                />
              </AnswerBox>
            </AnswerField>
          );
        }

        const body = renderValue(field, answers[field.key], isMobile, fmt);
        const shape = answerShape(field.type);
        // 高さが中身で決まるものだけ枠に入れる。1 行の値まで枠で囲むと、
        // 枠だけが並んで「どこが長文の欄なのか」が判らなくなる。
        const boxed = shape === "long" || shape === "table";

        return (
          <AnswerField key={field.key} label={label}>
            {boxed ? (
              <AnswerBox>{body}</AnswerBox>
            ) : (
              <Text component="div" fw={500} size="sm">
                {body}
              </Text>
            )}
          </AnswerField>
        );
      })}
    </Stack>
  );
}
