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
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  type FormOption,
  fetchFormFieldOptions,
  searchFormOptions,
} from "@/app/(dashboard)/general/forms/actions";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  canBeTitleField,
  FIELD_KEY_PATTERN,
  FORM_FIELD_TYPES,
  type FormFieldDef,
  type FormFieldType,
  isNestableFieldType,
  isSafePattern,
  LOOKUP_SOURCES,
  MAX_PATTERN_LENGTH,
  nextFieldKey,
  type RelatedConfig,
} from "@/lib/form-schema";

const NEEDS_OPTIONS: FormFieldType[] = ["select", "multiselect"];
const NEEDS_PATTERN: FormFieldType[] = ["text", "textarea"];

/**
 * 項目キーの検証。**キーは画面に出さない**（追加時に field1, field2 … と自動で
 * 割り当てる）ので、ここが引っかかるのは取り込んだ定義が壊れているときだけ。
 * 内部識別子としては生き続けるので、検証自体は残す。
 */
export function fieldKeyError(key: string, others: string[]): string | null {
  if (!key) return "内部キーがありません";
  if (!FIELD_KEY_PATTERN.test(key))
    return "内部キーの形式が不正です（英字で始まる英数字・_）";
  if (others.includes(key)) return "内部キーが重複しています";
  return null;
}

export function FormFieldEditor({
  field,
  siblings,
  nestedOnly = false,
  onChange,
  onSetTitle,
}: {
  field: FormFieldDef;
  /** 同じ階層の他の項目。関連レコード一覧の突き合わせ先をラベルで選ばせる。 */
  siblings: FormFieldDef[];
  /** サブテーブルの列として編集するとき（置ける型が減る）。 */
  nestedOnly?: boolean;
  onChange: (next: FormFieldDef) => void;
  /**
   * この項目を一覧の見出しにする（他の項目からは自動的に外す）。
   * トップレベルの項目にしか渡さない — 見出しはフォームにつき 1 つで、
   * 他の兄弟項目を書き換える必要があるため、配列全体を持つ FormBuilder 側が実装する。
   */
  onSetTitle?: () => void;
}) {
  const isMobile = useIsMobile();
  const set = (patch: Partial<FormFieldDef>) =>
    onChange({ ...field, ...patch });
  const types = nestedOnly
    ? FORM_FIELD_TYPES.filter((t) => isNestableFieldType(t.value))
    : FORM_FIELD_TYPES;
  const keyError = fieldKeyError(
    field.key,
    siblings.map((f) => f.key),
  );
  const patternError =
    field.pattern && !isSafePattern(field.pattern)
      ? `使えない正規表現です（構文エラー、量指定の入れ子、または ${MAX_PATTERN_LENGTH} 文字超）`
      : undefined;

  return (
    <Stack gap="sm">
      {/*
        内部キー（field1, field2 …）は追加時に自動で割り当てる。画面には出さない —
        利用者が決めることではないし、あとから変えると過去の回答と結びつかなく
        なる。壊れた定義を取り込んだときだけ、下にエラーとして出る。
      */}
      <TextInput
        label="表示名"
        onChange={(e) =>
          set({ label: { ...field.label, ja: e.currentTarget.value } })
        }
        placeholder="会社名"
        value={field.label.ja}
        withAsterisk
      />
      {keyError && (
        <Text c="red" size="xs">
          {keyError}（取り込んだ定義が壊れています）
        </Text>
      )}

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

      {!nestedOnly && (
        <Checkbox
          checked={field.isTitle === true}
          description="一覧（CM02 の回答一覧・CM01 の回答行）でこの項目の値を見出しとして表示します。フォームにつき 1 つだけ選べます"
          disabled={!canBeTitleField(field.type)}
          label="一覧の見出しにする"
          onChange={(e) => {
            if (e.currentTarget.checked) {
              onSetTitle?.();
            } else {
              set({ isTitle: false });
            }
          }}
        />
      )}

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
                siblings={(field.columns ?? []).filter((_, idx) => idx !== i)}
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
        <RelatedConfigEditor
          field={field}
          onChange={(related) => set({ related })}
          siblings={siblings}
        />
      )}
    </Stack>
  );
}

/**
 * 関連レコード一覧の設定。項目キーは画面に出さない方針なので、
 * 「どのフォームの、どの項目と突き合わせるか」はすべてラベルで選ばせる。
 * 参照先フォームを選んだ時点で、そのフォームの項目を読みに行く。
 */
function RelatedConfigEditor({
  field,
  siblings,
  onChange,
}: {
  field: FormFieldDef;
  siblings: FormFieldDef[];
  onChange: (related: RelatedConfig) => void;
}) {
  const isMobile = useIsMobile();
  const current: RelatedConfig = field.related ?? {
    targetFormCode: "",
    targetFieldKey: "",
    thisFieldKey: "",
    columns: [],
    limit: 20,
  };
  const [forms, setForms] = useState<FormOption[]>([]);
  const [targetFields, setTargetFields] = useState<FormOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 参照先の候補は開いたときに 1 度だけ引く（フォームの数はたかが知れている）。
  useEffect(() => {
    let alive = true;
    searchFormOptions("").then((rows) => {
      if (alive) setForms(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!current.targetFormCode) {
      setTargetFields([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchFormFieldOptions(current.targetFormCode)
      .then((rows) => {
        if (alive) setTargetFields(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [current.targetFormCode]);

  const set = (patch: Partial<RelatedConfig>) =>
    onChange({ ...current, ...patch });

  // 自分側の突き合わせ先は lookup が自然（会社名など）だが、テキストでも
  // 突き合わせられるので表示専用以外は全部出す。
  const ownOptions = siblings
    .filter((f) => f.type !== "related" && f.type !== "table")
    .map((f) => ({ value: f.key, label: f.label.ja || f.key }));

  return (
    <Stack gap="xs">
      <Select
        data={forms}
        description="この項目に一覧として埋め込むフォーム"
        label="参照先のフォーム"
        onChange={(v) =>
          set({ targetFormCode: v ?? "", targetFieldKey: "", columns: [] })
        }
        placeholder="フォームを選ぶ"
        searchable
        value={current.targetFormCode || null}
      />
      <Group align="flex-start" grow={!isMobile}>
        <Select
          data={ownOptions}
          description="このフォームの項目"
          label="突き合わせる項目（自分）"
          onChange={(v) => set({ thisFieldKey: v ?? "" })}
          placeholder="項目を選ぶ"
          searchable
          value={current.thisFieldKey || null}
        />
        <Select
          data={targetFields}
          description="参照先フォームの項目"
          disabled={!current.targetFormCode || loading}
          label="突き合わせる項目（参照先）"
          onChange={(v) => set({ targetFieldKey: v ?? "" })}
          placeholder={loading ? "読み込み中…" : "項目を選ぶ"}
          searchable
          value={current.targetFieldKey || null}
        />
      </Group>
      <MultiSelect
        data={targetFields}
        description="参照先の一覧に出す列（最大 8 つ）"
        disabled={!current.targetFormCode || loading}
        label="表示する列"
        maxValues={8}
        onChange={(v) => set({ columns: v })}
        placeholder="列を選ぶ"
        searchable
        value={current.columns}
      />
      <NumberInput
        label="最大表示件数"
        max={100}
        min={1}
        onChange={(v) => set({ limit: Number(v) || 20 })}
        value={current.limit}
      />
    </Stack>
  );
}
