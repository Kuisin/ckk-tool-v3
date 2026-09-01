"use client";

import { Group, MultiSelect, Pill, Select, Stack, Text } from "@mantine/core";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useTr } from "@/hooks/useTr";
import type { LookupSource } from "@/lib/form-schema";
import { recentsKeyFor, searcherFor } from "./lookup-dispatch";

/** 条件に使える項目（サーバ側でフォーム定義から作って渡す）。 */
export interface ConditionFieldOption {
  key: string;
  label: string;
  type: "select" | "multiselect" | "lookup";
  /** select / multiselect の選択肢。 */
  options?: { value: string; label: string }[];
  /** lookup の参照先。 */
  lookupSource?: LookupSource;
}

export interface ConditionValue {
  fieldKey: string | null;
  values: string[];
  /** 表示用のラベル（values と同じ並び）。 */
  labels: string[];
}

export const EMPTY_CONDITION: ConditionValue = {
  fieldKey: null,
  values: [],
  labels: [],
};

/**
 * 「この条件に当てはまる回答だけ見せる」の編集。
 *
 * 条件に使えるのは**選んで入れる項目だけ**（ドロップダウン・複数選択・
 * 業務データ検索）。自由入力を条件にすると、表記ゆれで見える／見えないが
 * 変わってしまう — 共有範囲が入力の綺麗さに左右されるのは危うい。
 */
export function ShareConditionEditor({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: ConditionFieldOption[];
  value: ConditionValue;
  onChange: (next: ConditionValue) => void;
  disabled?: boolean;
}) {
  const tr = useTr();
  const field = fields.find((f) => f.key === value.fieldKey) ?? null;

  const pickField = (key: string | null) =>
    // 項目を変えたら値は必ず捨てる（前の項目の値が残ると、当たらない条件が
    // 黙って保存され「なぜか 1 件も見えない」になる）。
    onChange({ fieldKey: key, values: [], labels: [] });

  if (fields.length === 0) {
    return (
      <Text c="dimmed" size="xs">
        {tr(
          tr(
            tr(
              "条件に使える項目がありません（ドロップダウン・複数選択・業務データ検索の\n        項目を作ると使えます）",
            ),
          ),
        )}
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Select
        clearable
        data={fields.map((f) => ({ value: f.key, label: f.label }))}
        description={tr("空なら全件見えます")}
        disabled={disabled}
        label={tr("この項目が")}
        onChange={pickField}
        placeholder={tr("条件にする項目")}
        value={value.fieldKey}
      />

      {field?.type === "lookup" && field.lookupSource && (
        <Stack gap={4}>
          <SearchSelect
            disabled={disabled}
            label={tr("次のいずれかのとき")}
            onChange={(v, option) => {
              if (!v || value.values.includes(v)) return;
              onChange({
                fieldKey: value.fieldKey,
                values: [...value.values, v],
                labels: [...value.labels, option?.label ?? v],
              });
            }}
            onSearch={searcherFor(field.lookupSource)}
            placeholder={tr("検索して追加")}
            storageKey={recentsKeyFor(field.lookupSource)}
            value={null}
          />
          <Group gap={4}>
            {value.values.map((v, i) => (
              <Pill
                key={v}
                onRemove={() =>
                  onChange({
                    fieldKey: value.fieldKey,
                    values: value.values.filter((x) => x !== v),
                    labels: value.labels.filter((_, idx) => idx !== i),
                  })
                }
                withRemoveButton={!disabled}
              >
                {value.labels[i] ?? v}
              </Pill>
            ))}
          </Group>
        </Stack>
      )}

      {field && field.type !== "lookup" && (
        <MultiSelect
          data={field.options ?? []}
          disabled={disabled}
          label={tr("次のいずれかのとき")}
          onChange={(vals) =>
            onChange({
              fieldKey: value.fieldKey,
              values: vals,
              labels: vals.map(
                (v) => field.options?.find((o) => o.value === v)?.label ?? v,
              ),
            })
          }
          placeholder={tr("値を選ぶ")}
          searchable
          value={value.values}
        />
      )}

      {field && value.values.length === 0 && (
        <Text c="dimmed" size="xs">
          {tr(
            tr(
              tr(
                "値を 1\n          つ以上選ぶまで、条件は保存されません（全件見える状態のままです）",
              ),
            ),
          )}
        </Text>
      )}
    </Stack>
  );
}
