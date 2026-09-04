"use client";

/**
 * フォーム回答 1 件の中身（社外向け）。
 *
 * ■ 社内の `FormResponseView` を使い回さない理由が 2 つある
 *   1. あちらは lookup の値を**社内画面へのリンク**にする
 *      （`/master/business-partners/…`）。社外の人には開けない URL で、
 *      押せないだけでなく社内の画面構成を教えてしまう。ここでは文字で出す。
 *   2. あちらは `useFormat()`（PreferencesProvider）に載っている。ポータルは
 *      社内セッションを持たないので、書式は帳票と同じ ja / JST 固定にする。
 *
 * **器の決め方（型 → inline / choices / long / table …）は
 * `lib/form-answer-display.ts` を共有する。** 型ごとの分岐をここで書き直すと、
 * 同じ回答が社内と社外で違って見える（複数行が 1 行に潰れる・添付が UUID の
 * まま出る、が実際に起きた）。
 *
 * 添付は出さない —— 添付はフォーム本体とは別の共有規則（file_folder_grants）
 * で守られていて、ここから引くとその規則を迂回する。件数だけを言う。
 */

import { Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { RichTextView } from "@/components/ui/RichTextView";
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
import {
  documentFormatters,
  formatCalendarDate,
  formatClockTime,
} from "@/lib/format";
import type { RichTextDoc } from "@/lib/rich-text-core";

/** 高さが中身で決まる欄の最低の高さ（1 行テキストと見分けが付くように）。 */
const LONG_ANSWER_MIN_HEIGHT = 64;

const FMT = documentFormatters.prefs;

function Empty() {
  return (
    <Text c="dimmed" size="sm">
      —
    </Text>
  );
}

function fieldLabel(field: FormFieldDef): string {
  return field.label.ja || field.key;
}

function Value({
  field,
  value,
  tr,
}: {
  field: FormFieldDef;
  value: FormAnswerValue;
  tr: ReturnType<typeof useTranslations>;
}): ReactNode {
  if (isBlankAnswer(field.type, value)) return <Empty />;

  switch (field.type) {
    case "richtext":
      return <RichTextView doc={value as unknown as RichTextDoc} />;

    case "textarea":
      // 改行と連続空白をそのまま出す（潰すと元の書き方が読めない）。
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
        <Text
          component="div"
          fw={500}
          size="sm"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatNumberAnswer(value)}
        </Text>
      );

    case "date":
      return (
        <Text size="sm">
          {formatCalendarDate(String(value), FMT.dateFormat)}
        </Text>
      );

    case "time":
      return (
        <Text size="sm">{formatClockTime(String(value), FMT.timeFormat)}</Text>
      );

    case "lookup":
      // **リンクにしない**（社内画面の URL を社外へ出さない）。
      return typeof value === "object" && value !== null && "label" in value ? (
        <Text size="sm">{String((value as { label: string }).label)}</Text>
      ) : (
        <Empty />
      );

    case "select":
    case "multiselect": {
      const labels = selectedLabels(field, value);
      if (labels.length === 0) return <Empty />;
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

    case "attachment": {
      // 生の ID は絶対に出さない（古い回答に値が残っていることがある）。
      const count = attachmentCount(value);
      return count > 0 ? (
        <Text c="dimmed" size="sm">
          {tr("common.filesWithCount", { count })}
        </Text>
      ) : (
        <Empty />
      );
    }

    default:
      return <Text size="sm">{String(value)}</Text>;
  }
}

/** サブテーブル。広い画面は表、狭い画面は 1 行 = 1 カード（design.md §20.2）。 */
function SubTable({
  columns,
  rows,
  tr,
}: {
  columns: FormFieldDef[];
  rows: Record<string, FormAnswerValue>[];
  tr: ReturnType<typeof useTranslations>;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Stack gap="sm">
        {rows.map((row, i) => (
          <Paper
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            key={i}
            p="sm"
            radius="sm"
            withBorder
          >
            <Stack gap={6}>
              <Text c="dimmed" size="xs">
                {tr("portal.forms.rowNumber", { row: i + 1 })}
              </Text>
              {columns.map((c) => (
                <Stack gap={2} key={c.key}>
                  <Text c="dimmed" size="xs">
                    {fieldLabel(c)}
                  </Text>
                  <Value field={c} tr={tr} value={row[c.key]} />
                </Stack>
              ))}
            </Stack>
          </Paper>
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
              <Table.Th key={c.key}>{fieldLabel(c)}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            <Table.Tr key={i}>
              {columns.map((c) => (
                <Table.Td key={c.key}>
                  <Value field={c} tr={tr} value={row[c.key]} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function PortalAnswerView({
  fields,
  answers,
}: {
  fields: FormFieldDef[];
  answers: Record<string, FormAnswerValue>;
}) {
  const tr = useTranslations();

  // related（関連レコード一覧）は参照先フォームの回答を引くもので、社外へ
  // 出す共有規則をこの表が迂回してしまう。項目ごと出さない。
  const visible = fields.filter((f) => f.type !== "related");

  if (visible.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("portal.forms.noAnswerFields")}
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {visible.map((field) => {
        const shape = answerShape(field.type);
        const value = answers[field.key];
        return (
          <Stack gap={4} key={field.key}>
            <Text c="dimmed" size="xs">
              {fieldLabel(field)}
            </Text>
            {shape === "long" ? (
              <Paper mih={LONG_ANSWER_MIN_HEIGHT} p="sm" radius="sm" withBorder>
                <Value field={field} tr={tr} value={value} />
              </Paper>
            ) : shape === "table" ? (
              tableRows(value).length === 0 ? (
                <Empty />
              ) : (
                <SubTable
                  columns={field.columns ?? []}
                  rows={tableRows(value)}
                  tr={tr}
                />
              )
            ) : (
              <Value field={field} tr={tr} value={value} />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
