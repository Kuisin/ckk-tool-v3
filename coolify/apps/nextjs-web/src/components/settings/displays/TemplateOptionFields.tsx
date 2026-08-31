"use client";

/**
 * TemplateOptionFields — テンプレートの設定欄を**登録簿から自動で組み立てる**。
 *
 * 画面を増やすたびにフォームを書くと、型・フォーム・検証の 3 か所を揃える
 * 作業が生まれて必ずずれる。宣言（lib/display-templates.ts）から描くことで、
 * テンプレートの追加は「登録簿に 1 エントリ + ページ 1 枚」で済む。
 *
 * 出すのは**選ぶだけの部品**に限る（数値・選択・スイッチ・短い文章）。
 * JSON や式を書かせない — 壁の設定を頼まれるのは現場の管理者で、
 * そこで詰まると「結局 IT に頼む」に戻ってしまう。
 */

import {
  NumberInput,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import type {
  DisplayOptionSpec,
  DisplayTemplate,
  DisplayTemplateOptions,
} from "@/lib/display-templates";

type Props = {
  template: DisplayTemplate;
  values: DisplayTemplateOptions;
  onChange: (key: string, value: unknown) => void;
  plantOptions: Array<{ value: string; label: string }>;
};

export function TemplateOptionFields({
  template,
  values,
  onChange,
  plantOptions,
}: Props) {
  return (
    <Stack gap="md">
      {template.options.map((spec) => (
        <OptionField
          key={spec.key}
          onChange={onChange}
          plantOptions={plantOptions}
          spec={spec}
          value={values[spec.key]}
        />
      ))}
    </Stack>
  );
}

function OptionField({
  spec,
  value,
  onChange,
  plantOptions,
}: {
  spec: DisplayOptionSpec;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  plantOptions: Array<{ value: string; label: string }>;
}) {
  switch (spec.kind) {
    case "plant":
      return (
        <Select
          clearable
          data={plantOptions}
          description={spec.help}
          label={spec.label}
          onChange={(v) => onChange(spec.key, v ? Number(v) : null)}
          placeholder="すべて"
          searchable
          value={typeof value === "number" ? String(value) : null}
        />
      );

    case "number":
      return (
        <NumberInput
          description={spec.help}
          label={spec.label}
          max={spec.max}
          min={spec.min}
          onChange={(v) => onChange(spec.key, Number(v) || spec.default)}
          suffix={spec.suffix ? ` ${spec.suffix}` : undefined}
          value={typeof value === "number" ? value : spec.default}
        />
      );

    case "select":
      return (
        <Select
          data={spec.choices.map((c) => ({ value: c.value, label: c.label }))}
          description={spec.help}
          label={spec.label}
          onChange={(v) => onChange(spec.key, v ?? spec.default)}
          value={typeof value === "string" ? value : spec.default}
        />
      );

    case "boolean":
      return (
        <Switch
          checked={typeof value === "boolean" ? value : spec.default}
          description={spec.help}
          label={spec.label}
          onChange={(e) => onChange(spec.key, e.currentTarget.checked)}
        />
      );

    case "text":
      return spec.multiline ? (
        <Textarea
          autosize
          description={spec.help}
          label={spec.label}
          maxLength={spec.maxLength}
          minRows={3}
          onChange={(e) => onChange(spec.key, e.currentTarget.value)}
          placeholder={spec.placeholder}
          value={typeof value === "string" ? value : spec.default}
        />
      ) : (
        <TextInput
          description={spec.help}
          label={spec.label}
          maxLength={spec.maxLength}
          onChange={(e) => onChange(spec.key, e.currentTarget.value)}
          placeholder={spec.placeholder}
          value={typeof value === "string" ? value : spec.default}
        />
      );
  }
}
