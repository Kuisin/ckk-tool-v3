"use client";

/**
 * FormResponseView — 提出済みの回答を読む。
 *
 * 描くのは「回答した時点のバージョンの項目」— あとから項目を消しても、
 * その回答は元の形のまま読める。lookup はリンクにする（kintone の商談メモで
 * 会社名・工場名が青字リンクになっているのと同じ役割）。
 *
 * 回答者は props に入っていなければ出さない。respondentVisibility=HIDDEN の
 * フォームではサーバ側で null にしてある。
 */

import { Anchor, Badge, Group, Stack, Table, Text } from "@mantine/core";
import Link from "next/link";
import { FieldValue } from "@/components/ui/FieldValue";
import { RichTextView } from "@/components/ui/RichTextView";
import type { FormAnswerValue, FormFieldDef } from "@/lib/form-schema";
import { lookupHref } from "@/lib/form-schema";
import type { RichTextDoc } from "@/lib/rich-text-core";

export interface RelatedTable {
  headers: string[];
  rows: { number: string; cells: string[] }[];
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

function renderValue(
  field: FormFieldDef,
  value: FormAnswerValue,
): React.ReactNode {
  if (value == null || value === "") return "—";

  switch (field.type) {
    case "richtext":
      return <RichTextView doc={value as unknown as RichTextDoc} />;
    case "lookup":
      return typeof value === "object" && "id" in value ? (
        <LookupValue
          field={field}
          value={value as { id: string; label: string }}
        />
      ) : (
        "—"
      );
    case "multiselect": {
      const labels = (field.options ?? [])
        .filter((o) => (value as string[]).includes(o.value))
        .map((o) => o.label.ja || o.value);
      return labels.length ? (
        <Group gap={4}>
          {labels.map((l) => (
            <Badge color="gray" key={l} variant="light">
              {l}
            </Badge>
          ))}
        </Group>
      ) : (
        "—"
      );
    }
    case "select": {
      const opt = (field.options ?? []).find((o) => o.value === value);
      return opt ? opt.label.ja || opt.value : String(value);
    }
    case "table": {
      const rows = Array.isArray(value)
        ? (value as Record<string, FormAnswerValue>[])
        : [];
      const columns = field.columns ?? [];
      if (rows.length === 0) return "—";
      return (
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
                  <Table.Td key={c.key}>{renderValue(c, row[c.key])}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      );
    }
    default:
      return typeof value === "string" ? value : String(value);
  }
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
  return (
    <Stack gap="md">
      {fields.map((field) => {
        if (field.type === "related") {
          const table = related[field.key];
          return (
            <Stack gap={4} key={field.key}>
              <Text c="dimmed" size="xs">
                {field.label.ja || field.key}
              </Text>
              {!table || table.rows.length === 0 ? (
                <Text size="sm">参照するレコードがありません。</Text>
              ) : (
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 180 }}>番号</Table.Th>
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
              )}
            </Stack>
          );
        }

        return (
          <FieldValue
            fullWidth={
              field.type === "textarea" ||
              field.type === "richtext" ||
              field.type === "table"
            }
            key={field.key}
            label={field.label.ja || field.key}
            value={renderValue(field, answers[field.key])}
          />
        );
      })}
    </Stack>
  );
}
