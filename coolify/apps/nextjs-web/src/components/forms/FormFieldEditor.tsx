"use client";

/**
 * FormFieldEditor — 項目 1 件の設定。ビルダーの中で開く。
 *
 * 「型を選ぶと、その型に関係する設定だけが出る」形にしてある
 * （settings/ItemDefEditForm.tsx と同じ考え方）。
 */

import {
  ActionIcon,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  FIELD_KEY_PATTERN,
  FORM_FIELD_TYPES,
  type FormFieldDef,
  type FormFieldType,
  isNestableFieldType,
  isSafePattern,
  LOOKUP_SOURCES,
  MAX_PATTERN_LENGTH,
  nextFieldKey,
} from "@/lib/form-schema";

const NEEDS_OPTIONS: FormFieldType[] = ["select", "multiselect"];
const NEEDS_PATTERN: FormFieldType[] = ["text", "textarea"];

export function fieldKeyError(key: string, others: string[]): string | null {
  if (!key) return "キーを入力してください";
  if (!FIELD_KEY_PATTERN.test(key))
    return "キーは英字で始まる英数字・_ のみ使えます";
  if (others.includes(key)) return "同じキーの項目があります";
  return null;
}

export function FormFieldEditor({
  field,
  siblingKeys,
  nestedOnly = false,
  onChange,
}: {
  field: FormFieldDef;
  siblingKeys: string[];
  /** サブテーブルの列として編集するとき（置ける型が減る）。 */
  nestedOnly?: boolean;
  onChange: (next: FormFieldDef) => void;
}) {
  const isMobile = useIsMobile();
  const set = (patch: Partial<FormFieldDef>) =>
    onChange({ ...field, ...patch });
  const types = nestedOnly
    ? FORM_FIELD_TYPES.filter((t) => isNestableFieldType(t.value))
    : FORM_FIELD_TYPES;
  const keyError = fieldKeyError(field.key, siblingKeys);
  const patternError =
    field.pattern && !isSafePattern(field.pattern)
      ? `使えない正規表現です（構文エラー、量指定の入れ子、または ${MAX_PATTERN_LENGTH} 文字超）`
      : undefined;

  return (
    <Stack gap="sm">
      <Group align="flex-start" grow={!isMobile}>
        <TextInput
          label="表示名"
          onChange={(e) =>
            set({ label: { ...field.label, ja: e.currentTarget.value } })
          }
          placeholder="会社名"
          value={field.label.ja}
          withAsterisk
        />
        <TextInput
          description="回答データの中で使うキー。あとから変えると過去の回答と結びつかなくなる"
          error={keyError ?? undefined}
          label="キー"
          onChange={(e) => set({ key: e.currentTarget.value })}
          placeholder="companyName"
          value={field.key}
          withAsterisk
        />
      </Group>

      <Group align="flex-start" grow={!isMobile}>
        <Select
          data={types.map((t) => ({ value: t.value, label: t.label }))}
          label="種類"
          onChange={(v) => set({ type: (v as FormFieldType) ?? "text" })}
          value={field.type}
        />
        <TextInput
          label="補足説明"
          onChange={(e) => set({ help: e.currentTarget.value })}
          placeholder="入力のヒント（任意）"
          value={field.help ?? ""}
        />
      </Group>

      <Checkbox
        checked={field.required}
        label="必須にする"
        onChange={(e) => set({ required: e.currentTarget.checked })}
      />

      {field.type === "number" && (
        <Group grow={!isMobile}>
          <NumberInput
            label="最小値"
            onChange={(v) => set({ min: v === "" ? undefined : Number(v) })}
            value={field.min ?? ""}
          />
          <NumberInput
            label="最大値"
            onChange={(v) => set({ max: v === "" ? undefined : Number(v) })}
            value={field.max ?? ""}
          />
        </Group>
      )}

      {NEEDS_PATTERN.includes(field.type) && (
        <Group align="flex-start" grow={!isMobile}>
          <TextInput
            description="入力の形式を縛りたいときだけ。空なら自由入力"
            error={patternError}
            label="形式（正規表現）"
            onChange={(e) =>
              set({ pattern: e.currentTarget.value || undefined })
            }
            placeholder="^[0-9]{3}-[0-9]{4}$"
            value={field.pattern ?? ""}
          />
          <TextInput
            label="形式が違うときのメッセージ"
            onChange={(e) =>
              set({ patternMessage: e.currentTarget.value || undefined })
            }
            placeholder="郵便番号の形式で入力してください"
            value={field.patternMessage ?? ""}
          />
        </Group>
      )}

      {field.type === "lookup" && (
        <Select
          data={LOOKUP_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
          description="選んだ値は、その業務データの詳細画面へのリンクとして表示される"
          label="検索するデータ"
          onChange={(v) =>
            set({
              lookup: {
                source:
                  (v as (typeof LOOKUP_SOURCES)[number]["value"]) ?? "product",
              },
            })
          }
          value={field.lookup?.source ?? "product"}
        />
      )}

      {NEEDS_OPTIONS.includes(field.type) && (
        <Stack gap="xs">
          <Text fw={500} size="sm">
            選択肢
          </Text>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>値</Table.Th>
                <Table.Th>表示名</Table.Th>
                <Table.Th style={{ width: 48 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(field.options ?? []).map((opt, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
                <Table.Tr key={i}>
                  <Table.Td>
                    <TextInput
                      onChange={(e) =>
                        set({
                          options: (field.options ?? []).map((o, idx) =>
                            idx === i
                              ? { ...o, value: e.currentTarget.value }
                              : o,
                          ),
                        })
                      }
                      value={opt.value}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      onChange={(e) =>
                        set({
                          options: (field.options ?? []).map((o, idx) =>
                            idx === i
                              ? {
                                  ...o,
                                  label: {
                                    ...o.label,
                                    ja: e.currentTarget.value,
                                  },
                                }
                              : o,
                          ),
                        })
                      }
                      value={opt.label.ja}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      aria-label="選択肢を削除"
                      color="red"
                      onClick={() =>
                        set({
                          options: (field.options ?? []).filter(
                            (_, idx) => idx !== i,
                          ),
                        })
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
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                set({
                  options: [
                    ...(field.options ?? []),
                    { value: "", label: { ja: "", en: "" } },
                  ],
                })
              }
            >
              選択肢を追加
            </GhostButton>
          </Group>
        </Stack>
      )}

      {field.type === "table" && (
        <Stack gap="xs">
          <Text fw={500} size="sm">
            列
          </Text>
          <Text c="dimmed" size="xs">
            サブテーブルの中にサブテーブル・関連レコード一覧・リッチテキストは置けません。
          </Text>
          {(field.columns ?? []).map((col, i) => (
            <Stack
              gap="xs"
              // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
              key={i}
              pl="md"
              style={{ borderLeft: "2px solid var(--mantine-color-gray-3)" }}
            >
              <Group justify="space-between">
                <Text c="dimmed" size="xs">
                  列 {i + 1}
                </Text>
                <ActionIcon
                  aria-label="列を削除"
                  color="red"
                  onClick={() =>
                    set({
                      columns: (field.columns ?? []).filter(
                        (_, idx) => idx !== i,
                      ),
                    })
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              <FormFieldEditor
                field={col}
                nestedOnly
                onChange={(next) =>
                  set({
                    columns: (field.columns ?? []).map((c, idx) =>
                      idx === i ? next : c,
                    ),
                  })
                }
                siblingKeys={(field.columns ?? [])
                  .filter((_, idx) => idx !== i)
                  .map((c) => c.key)}
              />
            </Stack>
          ))}
          <Group>
            <GhostButton
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                set({
                  columns: [
                    ...(field.columns ?? []),
                    {
                      key: nextFieldKey(
                        (field.columns ?? []).map((c) => c.key),
                      ),
                      label: {
                        ja: `列 ${(field.columns ?? []).length + 1}`,
                        en: "",
                      },
                      type: "text",
                      required: false,
                      order: (field.columns ?? []).length,
                    },
                  ],
                })
              }
            >
              列を追加
            </GhostButton>
          </Group>
        </Stack>
      )}

      {field.type === "related" && (
        <Stack gap="xs">
          <Group align="flex-start" grow={!isMobile}>
            <TextInput
              description="埋め込みたいフォームの共有コード（/f/ のあと）"
              label="参照先フォームのコード"
              onChange={(e) =>
                set({
                  related: {
                    targetFormCode: e.currentTarget.value,
                    targetFieldKey: field.related?.targetFieldKey ?? "",
                    thisFieldKey: field.related?.thisFieldKey ?? "",
                    columns: field.related?.columns ?? [],
                    limit: field.related?.limit ?? 20,
                  },
                })
              }
              value={field.related?.targetFormCode ?? ""}
            />
            <NumberInput
              label="最大表示件数"
              max={100}
              min={1}
              onChange={(v) =>
                set({
                  related: {
                    targetFormCode: field.related?.targetFormCode ?? "",
                    targetFieldKey: field.related?.targetFieldKey ?? "",
                    thisFieldKey: field.related?.thisFieldKey ?? "",
                    columns: field.related?.columns ?? [],
                    limit: Number(v) || 20,
                  },
                })
              }
              value={field.related?.limit ?? 20}
            />
          </Group>
          <Group align="flex-start" grow={!isMobile}>
            <TextInput
              description="このフォーム側の項目キー"
              label="突き合わせるキー（自分）"
              onChange={(e) =>
                set({
                  related: {
                    targetFormCode: field.related?.targetFormCode ?? "",
                    targetFieldKey: field.related?.targetFieldKey ?? "",
                    thisFieldKey: e.currentTarget.value,
                    columns: field.related?.columns ?? [],
                    limit: field.related?.limit ?? 20,
                  },
                })
              }
              value={field.related?.thisFieldKey ?? ""}
            />
            <TextInput
              description="参照先フォームの項目キー"
              label="突き合わせるキー（参照先）"
              onChange={(e) =>
                set({
                  related: {
                    targetFormCode: field.related?.targetFormCode ?? "",
                    targetFieldKey: e.currentTarget.value,
                    thisFieldKey: field.related?.thisFieldKey ?? "",
                    columns: field.related?.columns ?? [],
                    limit: field.related?.limit ?? 20,
                  },
                })
              }
              value={field.related?.targetFieldKey ?? ""}
            />
          </Group>
          <TextInput
            description="カンマ区切りの項目キー。参照先の一覧に出す列"
            label="表示する列"
            onChange={(e) =>
              set({
                related: {
                  targetFormCode: field.related?.targetFormCode ?? "",
                  targetFieldKey: field.related?.targetFieldKey ?? "",
                  thisFieldKey: field.related?.thisFieldKey ?? "",
                  columns: e.currentTarget.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  limit: field.related?.limit ?? 20,
                },
              })
            }
            value={(field.related?.columns ?? []).join(", ")}
          />
        </Stack>
      )}
    </Stack>
  );
}
