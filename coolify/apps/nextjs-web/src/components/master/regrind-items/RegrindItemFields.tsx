"use client";

/**
 * RegrindItemFields.tsx — 再研磨品目の入力欄（新規フォームと編集モーダルで共用）。
 *
 * 欄の並びは**値段を決めている順**にしてある: 何を（工具の種類）/ どこを
 * （加工箇所）/ 刃数 / サイズ帯 → いくら。旧 再研マスタの表の読み方と同じ順で、
 * 1 行ぶんの条件を上から埋めれば 1 つの値段になる。
 *
 * 条件は**自由記入**（マスタにしていない）。突合の鍵ではなく、探すため・読んで
 * 分かるための情報だから — どの品目を使うかは人が選ぶ。自動で当てるように
 * なったときに、小さなマスタへ昇格させるかを決める。
 */

import {
  Group,
  NumberInput,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { MasterKeywordsField } from "@/components/master/MasterKeywordsField";
import { LocalizedTextInput } from "@/components/ui/shells";

export interface RegrindItemFieldValues {
  nameJa: string;
  nameTranslations: Record<string, string>;
  unit: string;
  standardUnitPrice: number | null;
  toolClass: string | null;
  location: string | null;
  flutes: number | null;
  sizeMinMm: number | null;
  sizeMaxMm: number | null;
  matchNames: string[];
  isActive: boolean;
  notes: string;
}

export function RegrindItemFields({
  values,
  onChange,
  nameError,
}: {
  values: RegrindItemFieldValues;
  onChange: (part: Partial<RegrindItemFieldValues>) => void;
  /** 名称の検証エラー（新規フォームが送信時に立てる）。 */
  nameError?: string | null;
}) {
  const tr = useTranslations();

  return (
    <Stack gap="sm">
      <LocalizedTextInput
        jaProps={{
          error: nameError ?? undefined,
          value: values.nameJa,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ nameJa: e.currentTarget.value }),
        }}
        label={tr("common.name2")}
        required
        translationsProps={{
          value: values.nameTranslations,
          onChange: (v: Record<string, string>) =>
            onChange({ nameTranslations: v }),
        }}
      />
      <TextInput
        description={tr("master.regrindItems.toolClassHelp")}
        label={tr("master.regrindItems.toolClass")}
        onChange={(e) => onChange({ toolClass: e.currentTarget.value })}
        placeholder={tr("master.regrindItems.toolClassPlaceholder")}
        value={values.toolClass ?? ""}
      />
      <TextInput
        description={tr("master.regrindItems.locationHelp")}
        label={tr("master.regrindItems.location")}
        onChange={(e) => onChange({ location: e.currentTarget.value })}
        placeholder={tr("master.regrindItems.locationPlaceholder")}
        value={values.location ?? ""}
      />
      <Group align="flex-start" grow preventGrowOverflow={false}>
        <NumberInput
          allowDecimal={false}
          description={tr("master.regrindItems.flutesHelp")}
          label={tr("master.regrindItems.flutes")}
          min={1}
          onChange={(v) =>
            onChange({ flutes: typeof v === "number" ? v : null })
          }
          value={values.flutes ?? ""}
        />
        <NumberInput
          decimalScale={3}
          description={tr("master.regrindItems.sizeMinHelp")}
          label={tr("master.regrindItems.sizeMin")}
          min={0}
          onChange={(v) =>
            onChange({ sizeMinMm: typeof v === "number" ? v : null })
          }
          suffix=" mm"
          value={values.sizeMinMm ?? ""}
        />
        <NumberInput
          decimalScale={3}
          description={tr("master.regrindItems.sizeMaxHelp")}
          label={tr("master.regrindItems.sizeMax")}
          min={0}
          onChange={(v) =>
            onChange({ sizeMaxMm: typeof v === "number" ? v : null })
          }
          suffix=" mm"
          value={values.sizeMaxMm ?? ""}
        />
      </Group>
      <Group align="flex-start" grow preventGrowOverflow={false}>
        <NumberInput
          decimalScale={2}
          description={tr("master.regrindItems.standardPriceHelp")}
          hideControls
          label={tr("master.regrindItems.standardPrice")}
          min={0}
          onChange={(v) =>
            onChange({ standardUnitPrice: typeof v === "number" ? v : null })
          }
          prefix="¥"
          thousandSeparator=","
          value={values.standardUnitPrice ?? ""}
        />
        <TextInput
          label={tr("common.unit")}
          onChange={(e) => onChange({ unit: e.currentTarget.value })}
          value={values.unit}
          withAsterisk
        />
      </Group>
      {/*
        キーワード — 注文書に「再研磨（外周）」としか書かれていない行を
        探すときの手掛かり。製品マスタと同じ仕組み（match_names）。
      */}
      <MasterKeywordsField
        kind="product"
        label={tr("master.regrindItems.keywords")}
        onChange={(v) => onChange({ matchNames: v })}
        subject={{
          name: values.nameJa,
          attributes: [
            {
              label: tr("master.regrindItems.toolClass"),
              value: values.toolClass ?? "",
            },
            {
              label: tr("master.regrindItems.location"),
              value: values.location ?? "",
            },
          ].filter((a) => a.value !== ""),
        }}
        value={values.matchNames}
      />
      <Textarea
        autosize
        label={tr("common.notes")}
        minRows={2}
        onChange={(e) => onChange({ notes: e.currentTarget.value })}
        value={values.notes}
      />
      <Switch
        checked={values.isActive}
        label={tr("common.enabled")}
        onChange={(e) => onChange({ isActive: e.currentTarget.checked })}
      />
    </Stack>
  );
}
