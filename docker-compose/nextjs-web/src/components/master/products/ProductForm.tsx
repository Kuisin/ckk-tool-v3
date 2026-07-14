"use client";

/**
 * ProductForm.tsx — 製品 新規作成 / 編集フォーム (MS13 / MS23).
 *
 * Ported from design-preview (designs/master/products/new.tsx, edit.tsx) and
 * wired to the create/update Server Actions. 製品コードは保存時に自動採番
 * （PRD-YYYYMM-NNNN）。spec はキー/値の行エディタで編集する。
 * （設計図アップロードは design_files/ファイル基盤の導入時に追加する。）
 */

import {
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchStructuredMaterialTypeOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createProduct,
  updateProduct,
} from "@/app/(dashboard)/master/products/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { diameterCodeFromMm, lengthCodeFromMm } from "@/lib/material-code";

const BASE_PATH = "/master/products";

// 直径/全長の許容範囲（素材ビルダーと同じ）。
const DIAMETER_MIN = 0.1;
const DIAMETER_MAX = 99.9;
const LENGTH_MIN = 1;
const LENGTH_MAX = 999;

const productSchema = z
  .object({
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string(),
    // 製品が要求する素材 = 材種 + 直径 + 全長（特定素材には紐付けない）。
    materialTypeId: z.string().nullable(),
    materialTypeLabel: z.string(),
    diameterMm: z.number().nullable(),
    lengthMm: z.number().nullable(),
    unit: z.string().min(1, "単位を選択してください"),
    isActive: z.boolean(),
    notes: z.string(),
    spec: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((v, ctx) => {
    if (!v.materialTypeId) return;
    if (
      v.diameterMm == null ||
      v.diameterMm < DIAMETER_MIN ||
      v.diameterMm > DIAMETER_MAX
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diameterMm"],
        message: `直径は ${DIAMETER_MIN}〜${DIAMETER_MAX}mm で入力してください`,
      });
    }
    if (
      v.lengthMm == null ||
      v.lengthMm < LENGTH_MIN ||
      v.lengthMm > LENGTH_MAX
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lengthMm"],
        message: `全長は ${LENGTH_MIN}〜${LENGTH_MAX}mm で入力してください`,
      });
    }
  });

type FormValues = z.infer<typeof productSchema>;

export interface ProductFormInitial {
  id: number;
  code: string | null;
  nameJa: string;
  nameEn: string;
  materialTypeId: string | null;
  materialTypeLabel: string;
  diameterMm: number | null;
  lengthMm: number | null;
  unit: string;
  isActive: boolean;
  notes: string;
  spec: { key: string; value: string }[];
}

export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(productSchema),
    initialValues: {
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      materialTypeId: initial?.materialTypeId ?? null,
      materialTypeLabel: initial?.materialTypeLabel ?? "",
      diameterMm: initial?.diameterMm ?? null,
      lengthMm: initial?.lengthMm ?? null,
      unit: initial?.unit ?? "本",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
      spec: initial?.spec.length ? initial.spec : [{ key: "", value: "" }],
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateProduct(initial.id, values)
        : await createProduct(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "製品を更新しました" : "製品を作成しました",
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
        { label: "製品", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? `製品 編集 — ${initial.code ?? initial.nameJa}`
          : "製品 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description="形式: PRD-YYYYMM-NNNN（自動採番）"
            disabled
            label="製品コード"
            placeholder="保存時に自動採番"
            value={initial?.id ?? ""}
          />
          <Select
            data={UNIT_OPTIONS}
            label="単位"
            withAsterisk
            {...form.getInputProps("unit")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
          <Switch
            label="有効"
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label="備考"
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description="製品が要求する素材を「材種 + 直径 + 全長」で指定します。同一材種・直径の素材を全長に合わせて切断して使用します（特定の素材コードには紐付けません）。"
        title="素材仕様"
      >
        <SearchSelect
          description="変換済（コード構成あり）の材種のみ選択できます"
          label="材種"
          onChange={(value, option) => {
            form.setFieldValue("materialTypeId", value);
            form.setFieldValue("materialTypeLabel", option?.label ?? "");
          }}
          onSearch={searchStructuredMaterialTypeOptions}
          placeholder="材種コード・名称で検索"
          storageKey="product-material-type"
          value={form.values.materialTypeId}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <NumberInput
            decimalScale={1}
            description={`コード: ${
              form.values.diameterMm != null &&
              form.values.diameterMm >= DIAMETER_MIN &&
              form.values.diameterMm <= DIAMETER_MAX
                ? diameterCodeFromMm(form.values.diameterMm)
                : "—"
            }（径×10）`}
            error={form.errors.diameterMm}
            label="直径 (mm)"
            max={DIAMETER_MAX}
            min={DIAMETER_MIN}
            onChange={(val) =>
              form.setFieldValue(
                "diameterMm",
                val === "" || val == null ? null : Number(val),
              )
            }
            step={0.1}
            value={form.values.diameterMm ?? ""}
          />
          <NumberInput
            description={`コード: ${
              form.values.lengthMm != null &&
              form.values.lengthMm >= LENGTH_MIN &&
              form.values.lengthMm <= LENGTH_MAX
                ? lengthCodeFromMm(form.values.lengthMm)
                : "—"
            }`}
            error={form.errors.lengthMm}
            label="全長 (mm)"
            max={LENGTH_MAX}
            min={LENGTH_MIN}
            onChange={(val) =>
              form.setFieldValue(
                "lengthMm",
                val === "" || val == null ? null : Number(val),
              )
            }
            value={form.values.lengthMm ?? ""}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="項目名と値の組み合わせで自由に記述できます（spec JSON）。"
        title="仕様"
      >
        {form.values.spec.map((_, index) => (
          <Group
            align="flex-start"
            gap="xs"
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
            key={index}
            mb="xs"
            wrap="nowrap"
          >
            <TextInput
              placeholder="項目名（例: 外径）"
              style={{ flex: 1 }}
              {...form.getInputProps(`spec.${index}.key`)}
            />
            <TextInput
              placeholder="値（例: φ20 ±0.01）"
              style={{ flex: 1 }}
              {...form.getInputProps(`spec.${index}.value`)}
            />
            <GhostButton
              aria-label="この項目を削除"
              color="red"
              disabled={form.values.spec.length === 1}
              onClick={() => form.removeListItem("spec", index)}
              px={6}
            >
              <IconMinus size={14} />
            </GhostButton>
          </Group>
        ))}
        <GhostButton
          fullWidth={isMobile}
          leftSection={<IconPlus size={14} />}
          mt="xs"
          onClick={() => form.insertListItem("spec", { key: "", value: "" })}
        >
          仕様項目を追加
        </GhostButton>
      </FormSection>
    </FormShell>
  );
}
