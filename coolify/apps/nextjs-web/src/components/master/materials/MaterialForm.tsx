"use client";

/**
 * MaterialForm.tsx — 素材 新規作成 / 編集フォーム (MS16 / MS26).
 *
 * 新規は「ビルダー」: 材種（変換済のみ・サーバー検索）→ 黒皮・研磨 → 径mm・
 * 全長mm（コードは TEXT(径×10,'000') / TEXT(全長,'000') で自動導出）→ 種類
 * （親材種の形状で絞り込み）→ 素材コードのライブプレビュー。コード構成は
 * 作成後不変（編集ではロック表示）。
 */

import {
  Alert,
  NumberInput,
  Select,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import { searchStructuredMaterialTypeOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createMaterial,
  fetchStructuredMaterialType,
  updateMaterial,
} from "@/app/(dashboard)/master/materials/actions";
import { MasterKeywordsField } from "@/components/master/MasterKeywordsField";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { materialTypeF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { unitOptions } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import {
  composeMaterialCode,
  diameterCodeFromMm,
  lengthCodeFromMm,
} from "@/lib/material-code";
import type { Option } from "@/lib/mock";

const BASE_PATH = "/master/materials";

// 編集ではコード構成（識別）はロック表示のみ — 検証は新規時だけ課す。
const materialSchema = (isEdit: boolean) =>
  z.object({
    materialTypeId: isEdit
      ? z.string()
      : z.string().min(1, "材種を選択してください"),
    surfaceFinishCode: isEdit
      ? z.string()
      : z.string().min(1, "黒皮・研磨を選択してください"),
    diameterMm: z
      .number({ message: "直径を入力してください" })
      .min(0.1, "直径は 0.1〜99.9mm で入力してください")
      .max(99.9, "直径は 0.1〜99.9mm で入力してください"),
    lengthMm: z
      .number({ message: "全長を入力してください" })
      .min(1, "全長は 1〜999mm で入力してください")
      .max(999, "全長は 1〜999mm で入力してください"),
    kindCode: isEdit ? z.string() : z.string().min(1, "種類を選択してください"),
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameTranslations: z.record(z.string(), z.string()).default({}),
    unit: z.string().min(1, "単位を選択してください"),
    manufacturerModel: z.string(),
    nominalDiameterMm: z.union([z.number(), z.literal("")]),
    matchNames: z.array(z.string()),
    isActive: z.boolean(),
    notes: z.string(),
  });

type FormValues = z.infer<ReturnType<typeof materialSchema>>;

export interface MaterialFormInitial {
  id: number;
  /** 素材コード（表示・不変）。 */
  code: string;
  // 識別（表示のみ）
  materialTypeLabel: string;
  surfaceFinishLabel: string;
  diameterMm: number;
  lengthMm: number;
  kindLabel: string;
  // 編集可能
  nameJa: string;
  nameTranslations: Record<string, string>;
  unit: string;
  manufacturerModel: string;
  nominalDiameterMm: number | null;
  matchNames: string[];
  isActive: boolean;
  notes: string;
}

export function MaterialForm({
  initial,
  finishOptions,
  manufacturerOptions = [],
  shapeOptions = [],
}: {
  initial?: MaterialFormInitial;
  /** 黒皮・研磨の選択肢（新規時のみ使用）。 */
  finishOptions: Option[];
  /** 材種 F4 詳細検索のフィルタ options（新規時のみ使用）。 */
  manufacturerOptions?: Option[];
  shapeOptions?: Option[];
}) {
  const tr = useTr();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  // 選択中の材種のコード・形状・名称・種類一覧（サーバーから取得）
  const [kindOptions, setKindOptions] = useState<Option[]>([]);
  const [typeNameJa, setTypeNameJa] = useState("");
  const [typeCode, setTypeCode] = useState("");
  // 自動プレフィルした名称を追跡 — ユーザーが触っていなければ追従更新する
  const lastAutoName = useRef("");

  const form = useForm<FormValues>({
    validate: zodResolver(materialSchema(isEdit)),
    initialValues: {
      materialTypeId: "",
      surfaceFinishCode: "",
      diameterMm: initial?.diameterMm ?? 3,
      lengthMm: initial?.lengthMm ?? 330,
      kindCode: "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      unit: initial?.unit ?? tr("本"),
      manufacturerModel: initial?.manufacturerModel ?? "",
      nominalDiameterMm: initial?.nominalDiameterMm ?? "",
      matchNames: initial?.matchNames ?? [],
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  // 名称の自動プレフィル — 材種・径・全長の変化に追従（手入力後は触らない）
  const dMm = Number(form.values.diameterMm) || 0;
  const lMm = Number(form.values.lengthMm) || 0;
  const nameJa = form.values.nameJa;
  const setFieldValue = form.setFieldValue;
  useEffect(() => {
    if (isEdit || !typeNameJa || !dMm || !lMm) return;
    const auto = `${typeNameJa} φ${dMm}×${lMm}`;
    if (nameJa === auto) {
      lastAutoName.current = auto;
      return; // 既に追従済み — 再 set すると無限ループになる
    }
    if (!nameJa || nameJa === lastAutoName.current) {
      setFieldValue("nameJa", auto);
      lastAutoName.current = auto;
    }
  }, [isEdit, typeNameJa, dMm, lMm, nameJa, setFieldValue]);

  const onTypeChange = (value: string | null) => {
    form.setFieldValue("materialTypeId", value ?? "");
    form.setFieldValue("kindCode", "");
    setKindOptions([]);
    setTypeNameJa("");
    setTypeCode("");
    if (!value) return;
    startTransition(async () => {
      const res = await fetchStructuredMaterialType(Number(value));
      if (!res.ok) {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
        return;
      }
      setKindOptions(res.data.kindOptions);
      setTypeNameJa(res.data.nameJa);
      setTypeCode(res.data.code);
      // 通常形状（A）の既定種類 A0 があれば選択
      const a0 = res.data.kindOptions.find((k) => k.value === "A0");
      if (res.data.kindOptions.length === 1) {
        form.setFieldValue("kindCode", res.data.kindOptions[0].value);
      } else if (res.data.shapeCode === "A" && a0) {
        form.setFieldValue("kindCode", a0.value);
      }
    });
  };

  // ── コードプレビュー ─────────────────────────────────────────────
  const preview = (() => {
    if (isEdit) return initial.code;
    const { surfaceFinishCode, diameterMm, lengthMm } = form.values;
    const d = Number(diameterMm);
    const l = Number(lengthMm);
    try {
      if (!typeCode || !surfaceFinishCode || !d || !l) throw new Error();
      return composeMaterialCode(
        typeCode,
        surfaceFinishCode,
        diameterCodeFromMm(d),
        lengthCodeFromMm(l),
      );
    } catch {
      const dc = d >= 0.1 && d <= 99.9 ? diameterCodeFromMm(d) : "###";
      const fc = surfaceFinishCode || "#";
      const lc = l >= 1 && l <= 999 ? lengthCodeFromMm(l) : "###";
      return `${typeCode || "????????"}-${fc}${dc}-${lc}`;
    }
  })();

  // キーワード生成に渡す「いま画面に出ている素材の姿」。素材は名称が
  // 「K40UF φ3×330」のような機械的な文字列なので、材種・寸法・型式まで渡さないと
  // 呼び方の候補が出ない。
  const keywordSubject = {
    name: form.values.nameJa || form.values.nameTranslations.en || "",
    code: isEdit ? initial.code : preview,
    attributes: [
      { label: tr("英語名"), value: form.values.nameTranslations.en ?? "" },
      {
        label: tr("材種"),
        value: isEdit
          ? initial.materialTypeLabel
          : [typeCode, typeNameJa].filter(Boolean).join(" — "),
      },
      {
        label: tr("黒皮・研磨"),
        value: isEdit
          ? initial.surfaceFinishLabel
          : form.values.surfaceFinishCode,
      },
      { label: tr("直径 (mm)"), value: String(form.values.diameterMm ?? "") },
      { label: tr("全長 (mm)"), value: String(form.values.lengthMm ?? "") },
      {
        label: tr("種類"),
        value: isEdit ? initial.kindLabel : form.values.kindCode,
      },
      { label: tr("単位"), value: form.values.unit },
      { label: tr("メーカ型式"), value: form.values.manufacturerModel },
      {
        label: tr("呼び径 (mm)"),
        value:
          form.values.nominalDiameterMm === ""
            ? ""
            : String(form.values.nominalDiameterMm),
      },
      { label: tr("備考"), value: form.values.notes },
    ].filter((a) => a.value.trim() !== ""),
  };

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const editable = {
        nameJa: values.nameJa,
        nameTranslations: values.nameTranslations,
        unit: values.unit,
        manufacturerModel: values.manufacturerModel,
        nominalDiameterMm:
          values.nominalDiameterMm === "" ? null : values.nominalDiameterMm,
        matchNames: values.matchNames,
        isActive: values.isActive,
        notes: values.notes,
      };
      const result = isEdit
        ? await updateMaterial(initial.id, editable)
        : await createMaterial({
            ...editable,
            materialTypeId: Number(values.materialTypeId),
            surfaceFinishCode: values.surfaceFinishCode,
            diameterMm: Number(values.diameterMm),
            lengthMm: Number(values.lengthMm),
            kindCode: values.kindCode,
          });
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: isEdit ? "素材を更新しました" : tr("素材を作成しました"),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("素材"), href: BASE_PATH },
        isEdit ? "編集" : tr("新規作成"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? tr("素材 編集 — {code}", { code: initial.code })
          : tr("素材 新規作成")
      }
    >
      <FormSection
        description={
          isEdit
            ? tr(
                tr(
                  tr(
                    "コード構成（材種・黒皮研磨・直径・全長・種類）は作成後変更できません。",
                  ),
                ),
              )
            : tr(
                tr(
                  tr(
                    "素材コードは構成から自動で組み立てられます: [材種]-[黒皮研磨][径×10]-[全長]",
                  ),
                ),
              )
        }
        title={tr("コード構成")}
      >
        {isEdit ? (
          <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
            <TextInput
              disabled
              label={<HelpLabel {...fieldHelp("material", "materialType")} />}
              value={initial.materialTypeLabel}
            />
            <TextInput
              disabled
              label={<HelpLabel {...fieldHelp("material", "surfaceFinish")} />}
              value={initial.surfaceFinishLabel}
            />
            <TextInput
              disabled
              label={<HelpLabel {...fieldHelp("material", "kind")} />}
              value={initial.kindLabel}
            />
            <TextInput
              disabled
              label={
                <HelpLabel
                  {...fieldHelp("material", "dimensions", {
                    label: tr("直径 (mm)"),
                  })}
                />
              }
              value={String(initial.diameterMm)}
            />
            <TextInput
              disabled
              label={
                <HelpLabel
                  {...fieldHelp("material", "dimensions", {
                    label: tr("全長 (mm)"),
                  })}
                />
              }
              value={String(initial.lengthMm)}
            />
            <TextInput
              disabled
              label={<HelpLabel {...fieldHelp("material", "code")} />}
              value={initial.code}
            />
          </SimpleGrid>
        ) : (
          <>
            <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
              <SearchSelect
                description={tr(
                  tr("変換済（コード構成あり）の材種のみ選択できます"),
                )}
                f4={materialTypeF4(manufacturerOptions, shapeOptions)}
                label={<HelpLabel {...fieldHelp("material", "materialType")} />}
                onChange={onTypeChange}
                onSearch={searchStructuredMaterialTypeOptions}
                placeholder={tr("材種コード・名称で検索")}
                storageKey="material-type-structured"
                value={form.values.materialTypeId || null}
                withAsterisk
              />
              <Select
                data={finishOptions}
                label={
                  <HelpLabel {...fieldHelp("material", "surfaceFinish")} />
                }
                placeholder={tr("区分を選択")}
                withAsterisk
                {...form.getInputProps("surfaceFinishCode")}
              />
              <NumberInput
                decimalScale={1}
                description={tr("コード: {v0}（径×10）", {
                  v0:
                    Number(form.values.diameterMm) >= 0.1 &&
                    Number(form.values.diameterMm) <= 99.9
                      ? diameterCodeFromMm(Number(form.values.diameterMm))
                      : "—",
                })}
                label={
                  <HelpLabel
                    {...fieldHelp("material", "dimensions", {
                      label: tr("直径 (mm)"),
                    })}
                  />
                }
                max={99.9}
                min={0.1}
                step={0.1}
                withAsterisk
                {...form.getInputProps("diameterMm")}
              />
              <NumberInput
                description={tr("コード: {v0}", {
                  v0:
                    Number(form.values.lengthMm) >= 1 &&
                    Number(form.values.lengthMm) <= 999
                      ? lengthCodeFromMm(Number(form.values.lengthMm))
                      : "—",
                })}
                label={
                  <HelpLabel
                    {...fieldHelp("material", "dimensions", {
                      label: tr("全長 (mm)"),
                    })}
                  />
                }
                max={999}
                min={1}
                withAsterisk
                {...form.getInputProps("lengthMm")}
              />
              <Select
                data={kindOptions}
                description={tr("親材種の形状に属する種類のみ")}
                disabled={kindOptions.length === 0}
                label={<HelpLabel {...fieldHelp("material", "kind")} />}
                placeholder={
                  form.values.materialTypeId
                    ? tr("種類を選択")
                    : tr("先に材種を選択してください")
                }
                withAsterisk
                {...form.getInputProps("kindCode")}
              />
            </SimpleGrid>
            <Alert
              color="blue"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              <Text size="sm">
                {tr("素材コード:")} <DocNumber>{preview}</DocNumber>
              </Text>
            </Alert>
          </>
        )}
      </FormSection>

      <FormSection title={tr("基本情報")}>
        <LocalizedTextInput
          help={fieldHelpTip("material", "name")}
          jaProps={form.getInputProps("nameJa")}
          label={tr("名称")}
          placeholder="K40UF φ3×330"
          required
          translationsProps={form.getInputProps("nameTranslations")}
        />
        <SimpleGrid cols={isMobile ? 1 : 3} mt="sm" spacing="sm">
          <Select
            data={unitOptions(locale)}
            label={<HelpLabel {...fieldHelp("material", "unit")} />}
            withAsterisk
            {...form.getInputProps("unit")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("material", "model", { label: tr("メーカ型式") })}
              />
            }
            placeholder="103.70.083"
            {...form.getInputProps("manufacturerModel")}
          />
          <NumberInput
            decimalScale={1}
            label={
              <HelpLabel
                {...fieldHelp("material", "model", {
                  label: tr("呼び径 (mm)"),
                })}
              />
            }
            min={0}
            {...form.getInputProps("nominalDiameterMm")}
          />
        </SimpleGrid>
        <Switch
          label={<HelpLabel {...fieldHelp("material", "active")} />}
          mt="md"
          {...form.getInputProps("isActive", { type: "checkbox" })}
        />
        <Textarea
          label={<HelpLabel {...fieldHelp("material", "notes")} />}
          mt="sm"
          placeholder={tr("備考・特記事項")}
          rows={3}
          {...form.getInputProps("notes")}
        />
        {/* 検索・AI 突合用の別名。候補は AI に作らせ、採用は人が決める。 */}
        <MasterKeywordsField
          kind="material"
          label={<HelpLabel {...fieldHelp("material", "keywords")} />}
          onChange={(v) => form.setFieldValue("matchNames", v)}
          subject={keywordSubject}
          value={form.values.matchNames}
        />
      </FormSection>
    </FormShell>
  );
}
