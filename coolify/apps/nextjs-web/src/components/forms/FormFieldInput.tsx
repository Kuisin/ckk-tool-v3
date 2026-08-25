"use client";

/**
 * FormFieldInput — フォーム項目 1 件の入力 UI。項目型ごとの分岐はここ 1 本。
 *
 * 検証は lib/form-schema.ts validateFieldValue が唯一の実装で、この画面は
 * それが返したメッセージを出すだけ。サーバも同じ関数を通すので、片方だけ緩い
 * ということが起きない。
 */

import {
  ActionIcon,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { FormAnswerValue, FormFieldDef } from "@/lib/form-schema";
import { MAX_TABLE_ROWS } from "@/lib/form-schema";
import type { RichTextDoc } from "@/lib/rich-text-core";
import { recentsKeyFor, searcherFor } from "./lookup-dispatch";

// リッチテキストのエディタは重いので、その項目がある画面だけで読み込む。
const RichTextEditorField = dynamic(
  () =>
    import("@/components/ui/RichTextEditorField").then(
      (m) => m.RichTextEditorField,
    ),
  { ssr: false },
);

export interface FieldInputProps {
  field: FormFieldDef;
  value: FormAnswerValue;
  error?: string;
  disabled?: boolean;
  onChange: (value: FormAnswerValue) => void;
}

function asString(v: FormAnswerValue): string {
  return typeof v === "string" ? v : "";
}

function asArray(v: FormAnswerValue): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

export function FormFieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
}: FieldInputProps) {
  const label = field.label.ja || field.key;
  const common = {
    label,
    description: field.help || undefined,
    error,
    withAsterisk: field.required,
    disabled,
  };

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          {...common}
          autosize
          minRows={3}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={field.placeholder}
          value={asString(value)}
        />
      );

    case "richtext":
      return (
        <Stack gap={4}>
          <Text fw={500} size="sm">
            {label}
            {field.required && (
              <Text c="red" component="span" span>
                {" *"}
              </Text>
            )}
          </Text>
          <RichTextEditorField
            onChange={(doc: RichTextDoc) =>
              onChange(doc as unknown as Record<string, unknown>)
            }
            placeholder={field.placeholder}
            value={(value as unknown as RichTextDoc | null) ?? null}
          />
          {error && (
            <Text c="red" size="xs">
              {error}
            </Text>
          )}
        </Stack>
      );

    case "number":
      return (
        <NumberInput
          {...common}
          max={field.max}
          min={field.min}
          onChange={(v) => onChange(v === "" ? "" : String(v))}
          placeholder={field.placeholder}
          value={asString(value) === "" ? "" : Number(asString(value))}
        />
      );

    case "date":
      return (
        <DatePickerInput
          {...common}
          clearable
          onChange={(d) => onChange(d ? String(d).slice(0, 10) : "")}
          placeholder={field.placeholder ?? "YYYY/MM/DD"}
          value={asString(value) || null}
          valueFormat="YYYY/MM/DD"
        />
      );

    case "time":
      return (
        <TextInput
          {...common}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={field.placeholder ?? "HH:MM"}
          type="time"
          value={asString(value)}
        />
      );

    case "select":
      return (
        <Select
          {...common}
          clearable={!field.required}
          data={(field.options ?? []).map((o) => ({
            value: o.value,
            label: o.label.ja || o.value,
          }))}
          onChange={(v) => onChange(v ?? "")}
          placeholder={field.placeholder ?? "選択してください"}
          searchable={(field.options ?? []).length > 5}
          value={asString(value) || null}
        />
      );

    case "multiselect":
      return (
        <MultiSelect
          {...common}
          clearable
          data={(field.options ?? []).map((o) => ({
            value: o.value,
            label: o.label.ja || o.value,
          }))}
          onChange={(v) => onChange(v)}
          placeholder={field.placeholder ?? "選択してください"}
          searchable={(field.options ?? []).length > 5}
          value={asArray(value)}
        />
      );

    case "lookup": {
      const source = field.lookup?.source ?? "product";
      const current =
        typeof value === "object" && value != null && "id" in value
          ? (value as { id: string; label: string })
          : null;
      return (
        <SearchSelect
          {...common}
          initialOption={
            current ? { value: current.id, label: current.label } : null
          }
          onChange={(v, option) =>
            onChange(v ? { id: v, label: option?.label ?? v } : null)
          }
          onSearch={searcherFor(source)}
          placeholder={field.placeholder ?? "検索して選択"}
          storageKey={recentsKeyFor(source)}
          value={current?.id ?? null}
        />
      );
    }

    case "table": {
      const rows = Array.isArray(value)
        ? (value as Record<string, FormAnswerValue>[])
        : [];
      const columns = field.columns ?? [];
      const setRow = (i: number, next: Record<string, FormAnswerValue>) =>
        onChange(rows.map((r, idx) => (idx === i ? next : r)));
      return (
        <Stack gap="xs">
          <Text fw={500} size="sm">
            {label}
            {field.required && (
              <Text c="red" component="span" span>
                {" *"}
              </Text>
            )}
          </Text>
          {field.help && (
            <Text c="dimmed" size="xs">
              {field.help}
            </Text>
          )}
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {columns.map((c) => (
                  <Table.Th key={c.key}>{c.label.ja || c.key}</Table.Th>
                ))}
                <Table.Th style={{ width: 48 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length + 1}>
                    <Text c="dimmed" size="sm">
                      行がありません
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 行に安定 id が無い（順序が同一性）
                <Table.Tr key={i}>
                  {columns.map((c) => (
                    <Table.Td key={c.key}>
                      <FormFieldInput
                        disabled={disabled}
                        field={{
                          ...c,
                          label: { ja: "", en: "" },
                          help: undefined,
                        }}
                        onChange={(v) => setRow(i, { ...row, [c.key]: v })}
                        value={row[c.key]}
                      />
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <ActionIcon
                      aria-label="この行を削除"
                      color="red"
                      disabled={disabled}
                      onClick={() =>
                        onChange(rows.filter((_, idx) => idx !== i))
                      }
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group>
            <GhostButton
              disabled={disabled || rows.length >= MAX_TABLE_ROWS}
              leftSection={<IconPlus size={14} />}
              onClick={() => onChange([...rows, {}])}
            >
              行を追加
            </GhostButton>
          </Group>
          {error && (
            <Text c="red" size="xs">
              {error}
            </Text>
          )}
        </Stack>
      );
    }

    case "attachment":
    case "related":
      // 添付は回答保存後に /api/attachments へ上げる（Server Action は 1MB 上限）。
      // 関連レコード一覧は読み取り専用でサーバが解決した内容を出す。
      // どちらも入力欄を持たないので、表示側（FormResponseView）が担当する。
      return null;

    default:
      return (
        <TextInput
          {...common}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={field.placeholder}
          value={asString(value)}
        />
      );
  }
}
