"use client";

import { Alert, Badge, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconForms } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FORM_FIELD_TYPES,
  type FormFieldDef,
  LOOKUP_SOURCES,
} from "@/lib/form-schema";

const TYPE_LABEL = new Map(FORM_FIELD_TYPES.map((t) => [t.value, t.label]));
const SOURCE_LABEL = new Map(LOOKUP_SOURCES.map((s) => [s.value, s.label]));

/**
 * 項目の内訳を 1 行 1 項目で説明する。**キーは出さない** — 自動採番にした時点で
 * 利用者に意味のない情報になったので、ラベルと設定だけを見せる。
 */
function detailOf(
  field: FormFieldDef,
  tr: ReturnType<typeof useTranslations>,
): string {
  switch (field.type) {
    case "select":
    case "multiselect": {
      const options = field.options ?? [];
      if (options.length === 0) {
        return tr("forms.formFieldsPanel.noOptionsSet");
      }
      const shown = options
        .slice(0, 4)
        .map((o) => o.label.ja || o.value)
        .join(" / ");
      return options.length > 4
        ? tr("forms.formFieldsPanel.shownPlusMore", {
            shown,
            count: options.length - 4,
          })
        : shown;
    }
    case "lookup": {
      const source = field.lookup?.source;
      const label = source ? SOURCE_LABEL.get(source) : undefined;
      return label
        ? tr("forms.formFieldsPanel.searchFromLabel", { label })
        : tr("forms.formFieldsPanel.noSearchSourceSet");
    }
    case "table": {
      const columns = field.columns ?? [];
      return columns.length > 0
        ? tr("forms.formFieldsPanel.columnsLabel", {
            columns: columns.map((c) => c.label.ja || c.key).join(" / "),
          })
        : tr("forms.formFieldsPanel.noColumnsSet");
    }
    case "related": {
      const target = field.related?.targetFormCode;
      return target
        ? tr("forms.formFieldsPanel.filteredResponsesOfForm", { target })
        : tr("forms.formFieldsPanel.noReferenceTargetSet");
    }
    case "text":
    case "textarea":
      return field.pattern
        ? tr("forms.formFieldsPanel.inputFormatLabel", {
            pattern: field.pattern,
          })
        : "";
    case "number": {
      const { min, max } = field;
      if (min != null && max != null) return `${min} 〜 ${max}`;
      if (min != null) {
        return tr("forms.formFieldsPanel.minOrMore", { min });
      }
      if (max != null) {
        return tr("forms.formFieldsPanel.maxOrLess", { max });
      }
      return "";
    }
    default:
      return "";
  }
}

export function FormFieldsPanel({
  fields,
  schemaError,
  currentVersion,
}: {
  fields: FormFieldDef[];
  schemaError: string | null;
  currentVersion: number;
}) {
  const tr = useTranslations();
  // 定義が壊れているのと、項目をまだ作っていないのは別の話。取り違えると
  // 「編集で直す」のか「作る」のか分からなくなるので、先に切り分ける。
  if (schemaError) {
    return (
      <Alert
        color="red"
        icon={<IconAlertTriangle size={16} />}
        title={tr("forms.formFieldsPanel.cannotReadTheItemDefinition")}
      >
        <Stack gap="xs">
          <Text size="sm">{schemaError}</Text>
          <Text c="dimmed" size="xs">
            {tr("forms.formFieldsPanel.savedDefinitionCannotBeRead", {
              version: currentVersion,
            })}
          </Text>
        </Stack>
      </Alert>
    );
  }

  if (fields.length === 0) {
    return (
      <EmptyState
        icon={<IconForms size={22} />}
        message={
          currentVersion === 0
            ? tr("forms.formFieldsPanel.thereAreNoItemsYetAdd")
            : tr("forms.formFieldsPanel.thisVersionHasNoItems")
        }
      />
    );
  }

  // DataTable の render は行だけを受け取るので、表示順は先に引けるようにしておく。
  const position = new Map(fields.map((f, i) => [f.key, i + 1]));

  return (
    <DataTable
      columns={[
        {
          key: "order",
          header: tr("forms.formFieldsPanel.order"),
          width: 60,
          align: "right",
          render: (f) => position.get(f.key) ?? "—",
        },
        {
          key: "label",
          header: tr("common.itemName"),
          render: (f) => (
            <Group gap="xs" wrap="nowrap">
              <Text fw={500} size="sm">
                {f.label.ja || tr("common.unnamed")}
              </Text>
              {f.required && (
                <Badge color="red" size="xs" variant="light">
                  {tr("common.required2")}
                </Badge>
              )}
              {f.isTitle && (
                <Badge color="blue" size="xs" variant="light">
                  {tr("common.heading")}
                </Badge>
              )}
            </Group>
          ),
        },
        {
          key: "type",
          header: tr("common.kind"),
          width: 220,
          render: (f) => (
            <Text size="sm">{TYPE_LABEL.get(f.type) ?? f.type}</Text>
          ),
        },
        {
          key: "detail",
          header: tr("common.settings"),
          render: (f) => {
            const detail = detailOf(f, tr);
            return detail ? (
              <Text c="dimmed" size="xs">
                {detail}
              </Text>
            ) : (
              <Text c="dimmed" size="xs">
                —
              </Text>
            );
          },
        },
      ]}
      data={fields}
      emptyMessage={tr("forms.formFieldsPanel.thereAreNoItems")}
      getRowId={(f) => f.key}
      // 項目定義は「順番のある 1 枚のリスト」なので区切らない。既定の 10 件
      // ページングだと 11 個目以降が 2 ページ目に隠れ、項目が無いように見える。
      pageSize={fields.length}
      // スマホは総称カード（「項目名: …／種類: …」の繰り返し）だと見出しが
      // 大半を占めるので、ラベルを主役にした 1 行 = 1 項目のカードにする。
      renderCard={(f) => {
        const detail = detailOf(f, tr);
        return (
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
                {position.get(f.key)}
              </Text>
              <Text fw={600} size="sm">
                {f.label.ja || tr("common.unnamed")}
              </Text>
              {f.required && (
                <Badge color="red" size="xs" variant="light">
                  {tr("common.required2")}
                </Badge>
              )}
              {f.isTitle && (
                <Badge color="blue" size="xs" variant="light">
                  {tr("common.heading")}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="xs">
              {detail
                ? tr("forms.formFieldsPanel.typeAndDetail", {
                    type: TYPE_LABEL.get(f.type) ?? f.type,
                    detail,
                  })
                : (TYPE_LABEL.get(f.type) ?? f.type)}
            </Text>
          </Stack>
        );
      }}
    />
  );
}
