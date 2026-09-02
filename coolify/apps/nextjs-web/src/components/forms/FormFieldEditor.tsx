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
import { useTranslations } from "next-intl";
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
  type FormFieldDef,
  type FormFieldType,
  formFieldTypes,
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
export function fieldKeyError(
  key: string,
  others: string[],
  tr: ReturnType<typeof useTranslations>,
): string | null {
  if (!key) return tr("forms.formFieldEditor.noInternalKey");
  if (!FIELD_KEY_PATTERN.test(key)) {
    return tr("forms.formFieldEditor.invalidInternalKeyFormat");
  }
  if (others.includes(key)) {
    return tr("forms.formFieldEditor.duplicateInternalKey");
  }
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
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const set = (patch: Partial<FormFieldDef>) =>
    onChange({ ...field, ...patch });
  const types = nestedOnly
    ? formFieldTypes(tr).filter((t) => isNestableFieldType(t.value))
    : formFieldTypes(tr);
  const keyError = fieldKeyError(
    field.key,
    siblings.map((f) => f.key),
    tr,
  );
  const patternError =
    field.pattern && !isSafePattern(field.pattern)
      ? tr("forms.formFieldEditor.unusableRegularExpression", {
          max: MAX_PATTERN_LENGTH,
        })
      : undefined;

  return (
    <Stack gap="sm">
      {/*
        内部キー（field1, field2 …）は追加時に自動で割り当てる。画面には出さない —
        利用者が決めることではないし、あとから変えると過去の回答と結びつかなく
        なる。壊れた定義を取り込んだときだけ、下にエラーとして出る。
      */}
      <TextInput
        label={tr("common.displayName")}
        onChange={(e) =>
          set({ label: { ...field.label, ja: e.currentTarget.value } })
        }
        placeholder={tr("forms.formFieldEditor.companyName")}
        value={field.label.ja}
        withAsterisk
      />
      {keyError && (
        <Text c="red" size="xs">
          {tr("forms.formFieldEditor.keyErrorImportedDefinitionIsBroken", {
            error: keyError,
          })}
        </Text>
      )}

      <Group align="flex-start" grow={!isMobile}>
        <Select
          data={types.map((t) => ({ value: t.value, label: t.label }))}
          label={tr("common.kind")}
          onChange={(v) => set({ type: (v as FormFieldType) ?? "text" })}
          value={field.type}
        />
        <TextInput
          label={tr("forms.formFieldEditor.additionalNotes")}
          onChange={(e) => set({ help: e.currentTarget.value })}
          placeholder={tr("forms.formFieldEditor.inputHintOptional")}
          value={field.help ?? ""}
        />
      </Group>

      <Checkbox
        checked={field.required}
        label={tr("forms.formFieldEditor.makeItRequired")}
        onChange={(e) => set({ required: e.currentTarget.checked })}
      />

      {!nestedOnly && (
        <Checkbox
          checked={field.isTitle === true}
          description={tr("forms.formFieldEditor.showsThisFieldSValueAs")}
          disabled={!canBeTitleField(field.type)}
          label={tr("forms.formFieldEditor.useAsTheListHeading")}
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
            label={tr("common.minimum")}
            onChange={(v) => set({ min: v === "" ? undefined : Number(v) })}
            value={field.min ?? ""}
          />
          <NumberInput
            label={tr("common.maximum")}
            onChange={(v) => set({ max: v === "" ? undefined : Number(v) })}
            value={field.max ?? ""}
          />
        </Group>
      )}

      {NEEDS_PATTERN.includes(field.type) && (
        <Group align="flex-start" grow={!isMobile}>
          <TextInput
            description={tr("forms.formFieldEditor.onlyWhenYouWantToConstrain")}
            error={patternError}
            label={tr("forms.formFieldEditor.formatRegularExpression")}
            onChange={(e) =>
              set({ pattern: e.currentTarget.value || undefined })
            }
            placeholder="^[0-9]{3}-[0-9]{4}$"
            value={field.pattern ?? ""}
          />
          <TextInput
            label={tr("forms.formFieldEditor.messageShownWhenTheFormatIs")}
            onChange={(e) =>
              set({ patternMessage: e.currentTarget.value || undefined })
            }
            placeholder={tr("forms.formFieldEditor.enterItAsAPostalCode")}
            value={field.patternMessage ?? ""}
          />
        </Group>
      )}

      {field.type === "lookup" && (
        <Select
          data={LOOKUP_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
          description={tr("forms.formFieldEditor.theChosenValueIsShownAs")}
          label={tr("forms.formFieldEditor.dataToSearch")}
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
            {tr("common.options")}
          </Text>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.value")}</Table.Th>
                <Table.Th>{tr("common.displayName")}</Table.Th>
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
                      aria-label={tr("common.removeOption")}
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
              {tr("common.addAnOption")}
            </GhostButton>
          </Group>
        </Stack>
      )}

      {field.type === "table" && (
        <Stack gap="xs">
          <Text fw={500} size="sm">
            {tr("forms.formFieldEditor.column")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("forms.formFieldEditor.aSubTableCannotContainAnother")}
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
                  aria-label={tr("forms.formFieldEditor.removeTheColumn")}
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
              {tr("forms.formFieldEditor.addAColumn")}
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
  const tr = useTranslations();
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
        description={tr("forms.formFieldEditor.theFormEmbeddedAsAList")}
        label={tr("forms.formFieldEditor.referencedForm")}
        onChange={(v) =>
          set({ targetFormCode: v ?? "", targetFieldKey: "", columns: [] })
        }
        placeholder={tr("forms.formFieldEditor.chooseAForm")}
        searchable
        value={current.targetFormCode || null}
      />
      <Group align="flex-start" grow={!isMobile}>
        <Select
          data={ownOptions}
          description={tr("forms.formFieldEditor.fieldsOnThisForm")}
          label={tr("forms.formFieldEditor.fieldToMatchOnThisForm")}
          onChange={(v) => set({ thisFieldKey: v ?? "" })}
          placeholder={tr("forms.formFieldEditor.pickAnItem")}
          searchable
          value={current.thisFieldKey || null}
        />
        <Select
          data={targetFields}
          description={tr("forms.formFieldEditor.fieldsOnTheReferencedForm")}
          disabled={!current.targetFormCode || loading}
          label={tr("forms.formFieldEditor.fieldToMatchOnReferencedForm")}
          onChange={(v) => set({ targetFieldKey: v ?? "" })}
          placeholder={
            loading ? "読み込み中…" : tr("forms.formFieldEditor.pickAnItem")
          }
          searchable
          value={current.targetFieldKey || null}
        />
      </Group>
      <MultiSelect
        data={targetFields}
        description={tr(
          "forms.formFieldEditor.columnsShownInTheReferencedList",
        )}
        disabled={!current.targetFormCode || loading}
        label={tr("common.columnsToShow")}
        maxValues={8}
        onChange={(v) => set({ columns: v })}
        placeholder={tr("forms.formFieldEditor.chooseAColumn")}
        searchable
        value={current.columns}
      />
      <NumberInput
        label={tr("forms.formFieldEditor.maximumRowsShown")}
        max={100}
        min={1}
        onChange={(v) => set({ limit: Number(v) || 20 })}
        value={current.limit}
      />
    </Stack>
  );
}
