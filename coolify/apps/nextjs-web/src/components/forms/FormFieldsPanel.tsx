"use client";

import { Alert, Badge, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconForms } from "@tabler/icons-react";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTr } from "@/hooks/useTr";
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
function detailOf(field: FormFieldDef): string {
  switch (field.type) {
    case "select":
    case "multiselect": {
      const options = field.options ?? [];
      if (options.length === 0) return "選択肢が未設定";
      const shown = options
        .slice(0, 4)
        .map((o) => o.label.ja || o.value)
        .join(" / ");
      return options.length > 4
        ? `${shown} ほか ${options.length - 4} 件`
        : shown;
    }
    case "lookup": {
      const source = field.lookup?.source;
      const label = source ? SOURCE_LABEL.get(source) : undefined;
      return label ? `${label}から検索` : "検索先が未設定";
    }
    case "table": {
      const columns = field.columns ?? [];
      return columns.length > 0
        ? `列: ${columns.map((c) => c.label.ja || c.key).join(" / ")}`
        : "列が未設定";
    }
    case "related": {
      const target = field.related?.targetFormCode;
      return target
        ? `フォーム ${target} の回答を絞り込んで表示`
        : "参照先が未設定";
    }
    case "text":
    case "textarea":
      return field.pattern ? `入力形式: ${field.pattern}` : "";
    case "number": {
      const { min, max } = field;
      if (min != null && max != null) return `${min} 〜 ${max}`;
      if (min != null) return `${min} 以上`;
      if (max != null) return `${max} 以下`;
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
  const tr = useTr();
  // 定義が壊れているのと、項目をまだ作っていないのは別の話。取り違えると
  // 「編集で直す」のか「作る」のか分からなくなるので、先に切り分ける。
  if (schemaError) {
    return (
      <Alert
        color="red"
        icon={<IconAlertTriangle size={16} />}
        title={tr("項目の定義を読み取れません")}
      >
        <Stack gap="xs">
          <Text size="sm">{schemaError}</Text>
          <Text c="dimmed" size="xs">
            保存されている定義（バージョン {currentVersion}）が、いまのアプリが
            読める形になっていません。「編集」から組み直して保存してください。
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
            ? tr("項目がまだありません。「編集」から追加してください")
            : tr("この版には項目がありません")
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
          header: tr("順"),
          width: 60,
          align: "right",
          render: (f) => position.get(f.key) ?? "—",
        },
        {
          key: "label",
          header: tr("項目名"),
          render: (f) => (
            <Group gap="xs" wrap="nowrap">
              <Text fw={500} size="sm">
                {f.label.ja || tr("（名称未設定）")}
              </Text>
              {f.required && (
                <Badge color="red" size="xs" variant="light">
                  {tr("必須")}
                </Badge>
              )}
              {f.isTitle && (
                <Badge color="blue" size="xs" variant="light">
                  {tr("見出し")}
                </Badge>
              )}
            </Group>
          ),
        },
        {
          key: "type",
          header: tr("種類"),
          width: 220,
          render: (f) => (
            <Text size="sm">{TYPE_LABEL.get(f.type) ?? f.type}</Text>
          ),
        },
        {
          key: "detail",
          header: tr("設定"),
          render: (f) => {
            const detail = detailOf(f);
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
      emptyMessage={tr("項目がありません")}
      getRowId={(f) => f.key}
      // 項目定義は「順番のある 1 枚のリスト」なので区切らない。既定の 10 件
      // ページングだと 11 個目以降が 2 ページ目に隠れ、項目が無いように見える。
      pageSize={fields.length}
      // スマホは総称カード（「項目名: …／種類: …」の繰り返し）だと見出しが
      // 大半を占めるので、ラベルを主役にした 1 行 = 1 項目のカードにする。
      renderCard={(f) => {
        const detail = detailOf(f);
        return (
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
                {position.get(f.key)}
              </Text>
              <Text fw={600} size="sm">
                {f.label.ja || tr("（名称未設定）")}
              </Text>
              {f.required && (
                <Badge color="red" size="xs" variant="light">
                  {tr("必須")}
                </Badge>
              )}
              {f.isTitle && (
                <Badge color="blue" size="xs" variant="light">
                  {tr("見出し")}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="xs">
              {TYPE_LABEL.get(f.type) ?? f.type}
              {detail ? ` ・ ${detail}` : ""}
            </Text>
          </Stack>
        );
      }}
    />
  );
}
