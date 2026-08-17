"use client";

/**
 * InspectionTemplateForm.tsx — 検査表テンプレート 新規作成 / 編集フォーム
 * (MS19 / MS29)。
 *
 * code は識別子（作成時のみ入力・編集不可）。関連工程は工程マスタから
 * サーバー検索で選択する。検査項目は詳細画面の「検査項目」タブでインライン
 * 追加・編集する（design.md §13.4 — このフォームでは扱わない）。
 */

import {
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchProcessStepOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createInspectionTemplate,
  updateInspectionTemplate,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { INSPECTION_SAMPLING_MODE_OPTIONS } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/inspection-templates";

const templateSchema = z
  .object({
    code: z
      .string()
      .min(1, "コードを入力してください")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "コードは英数字・ハイフン・アンダースコアで入力してください",
      ),
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string(),
    relatedProcessStepId: z.string().nullable(),
    samplingMode: z.enum(["ALL", "PERCENT", "COUNT"]),
    samplingValue: z.union([z.number(), z.literal("")]),
    recordStyle: z.enum(["VALUES", "COUNTS"]),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["samplingValue"],
        message,
      });
    if (v.samplingMode === "PERCENT") {
      if (
        v.samplingValue === "" ||
        v.samplingValue <= 0 ||
        v.samplingValue > 100
      ) {
        issue("検査対象の割合（0〜100%）を入力してください");
      }
    }
    if (v.samplingMode === "COUNT") {
      if (
        v.samplingValue === "" ||
        v.samplingValue < 1 ||
        !Number.isInteger(v.samplingValue)
      ) {
        issue("検査対象の本数（1 以上の整数）を入力してください");
      }
    }
  });

type FormValues = z.infer<typeof templateSchema>;

export interface InspectionTemplateFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  relatedProcessStepId: string | null;
  relatedProcessStepLabel: string;
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: number | null;
  recordStyle: "VALUES" | "COUNTS";
  isActive: boolean;
}

export function InspectionTemplateForm({
  initial,
}: {
  initial?: InspectionTemplateFormInitial;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(templateSchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      relatedProcessStepId: initial?.relatedProcessStepId ?? null,
      samplingMode: initial?.samplingMode ?? "ALL",
      samplingValue: initial?.samplingValue ?? "",
      recordStyle: initial?.recordStyle ?? "VALUES",
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const relatedProcessStepId = values.relatedProcessStepId
        ? Number(values.relatedProcessStepId)
        : null;
      const input = {
        nameJa: values.nameJa,
        nameEn: values.nameEn,
        relatedProcessStepId,
        samplingMode: values.samplingMode,
        samplingValue:
          values.samplingMode === "ALL" || values.samplingValue === ""
            ? null
            : values.samplingValue,
        recordStyle: values.recordStyle,
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateInspectionTemplate(initial.id, input)
        : await createInspectionTemplate({ ...input, code: values.code });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? "検査表テンプレートを更新しました"
            : "検査表テンプレートを作成しました",
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        "マスタ",
        { label: "検査表テンプレート", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
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
          ? `検査表テンプレート 編集 — ${initial.code}`
          : "検査表テンプレート 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit ? "コードは作成後変更できません" : "英数字・-・_（一意）"
            }
            disabled={isEdit}
            label={
              <HelpLabel
                {...fieldHelp("inspectionTemplate", "code", {
                  label: "コード",
                })}
              />
            }
            placeholder="例: INSP-DIM-01"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <SearchSelect
            description="このテンプレートを既定で使う検査工程（任意）"
            initialOption={
              initial?.relatedProcessStepId
                ? {
                    value: initial.relatedProcessStepId,
                    label: initial.relatedProcessStepLabel,
                  }
                : undefined
            }
            label={
              <HelpLabel {...fieldHelp("inspectionTemplate", "processStep")} />
            }
            onChange={(value) =>
              form.setFieldValue("relatedProcessStepId", value)
            }
            onSearch={searchProcessStepOptions}
            placeholder="工程コード・名称で検索"
            storageKey="inspection-template-process-step"
            value={form.values.relatedProcessStepId}
          />
        </SimpleGrid>
        <SimpleGrid cols={1} mt="sm" spacing="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            help={fieldHelpTip("inspectionTemplate", "code")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
          <Stack gap={4}>
            <Text fw={500} size="sm">
              検査対象（このシートで検査する製品数）
            </Text>
            <Group gap="sm" wrap="wrap">
              <SegmentedControl
                data={INSPECTION_SAMPLING_MODE_OPTIONS}
                onChange={(v) => {
                  form.setFieldValue(
                    "samplingMode",
                    v as "ALL" | "PERCENT" | "COUNT",
                  );
                  if (v === "ALL") form.setFieldValue("samplingValue", "");
                }}
                value={form.values.samplingMode}
              />
              {form.values.samplingMode !== "ALL" && (
                <NumberInput
                  aria-label={
                    form.values.samplingMode === "PERCENT"
                      ? "検査対象の割合(%)"
                      : "検査対象の本数"
                  }
                  max={form.values.samplingMode === "PERCENT" ? 100 : undefined}
                  min={form.values.samplingMode === "PERCENT" ? 0.01 : 1}
                  suffix={form.values.samplingMode === "PERCENT" ? " %" : " 本"}
                  w={140}
                  {...form.getInputProps("samplingValue")}
                />
              )}
            </Group>
            <Text c="dimmed" size="xs">
              全数 = ロット全数 / 割合・本数 = 一部を抜き取って検査
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text fw={500} size="sm">
              記録方式
            </Text>
            <SegmentedControl
              data={[
                { value: "VALUES", label: "実測値（製品ごと）" },
                { value: "COUNTS", label: "合格数のみ" },
              ]}
              onChange={(v) =>
                form.setFieldValue("recordStyle", v as "VALUES" | "COUNTS")
              }
              value={form.values.recordStyle}
            />
            <Text c="dimmed" size="xs">
              実測値 = 製品ごとにページ送りで全項目を記録 / 合格数のみ =
              項目ごとに検査数・合格数だけを記録
            </Text>
          </Stack>
          <Switch
            label={<HelpLabel {...fieldHelp("inspectionTemplate", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
