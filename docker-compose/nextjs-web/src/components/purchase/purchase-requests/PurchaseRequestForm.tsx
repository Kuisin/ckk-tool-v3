"use client";

/**
 * PurchaseRequestForm — 購買依頼 新規作成 / 編集 (PU04, design.md §8.3)。
 *
 * ヘッダ（依頼理由 / 備考）+ 明細 1..N 行（素材 SearchSelect / 入荷先工場
 * Select / 数量 + 単位 / 希望納期 / 備考）。単価・金額は持たない
 * （発注書へ変換した後、発注側で確定する）。
 *
 * 編集は DRAFT / REJECTED のみ（サーバー側でもガード）。保存後は詳細へ遷移。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createPurchaseRequest,
  updatePurchaseRequest,
} from "@/app/(dashboard)/purchase/purchase-requests/actions";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import type { PurchaseRequestView } from "./model";

const BASE_PATH = "/purchase/purchase-requests";

interface Option {
  value: string;
  label: string;
}

const itemSchema = z.object({
  rowId: z.string(),
  materialId: z.string().min(1, "素材を選択してください"),
  materialLabel: z.string(),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("0より大きい値"),
  unit: z.string().min(1, "必須"),
  desiredAt: z.string().nullable(),
  notes: z.string(),
});

const schema = z.object({
  purpose: z.string(),
  notes: z.string(),
  items: z.array(itemSchema).min(1, "明細を1件以上追加してください"),
});

type FormValues = z.infer<typeof schema>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (): ItemForm => ({
  rowId: newRowId(),
  materialId: "",
  materialLabel: "",
  factoryId: null,
  quantity: 1,
  unit: "本",
  desiredAt: null,
  notes: "",
});

function toFormValues(request: PurchaseRequestView): FormValues {
  return {
    purpose: request.purpose ?? "",
    notes: request.notes ?? "",
    items: request.items.map((it) => ({
      rowId: newRowId(),
      materialId: it.materialId,
      materialLabel: `${it.materialCode}（${it.materialName}）`,
      factoryId: it.factoryId,
      quantity: it.quantity,
      unit: it.unit,
      desiredAt: it.desiredAt,
      notes: it.notes ?? "",
    })),
  };
}

export function PurchaseRequestForm({
  mode,
  purchaseRequest,
  factoryOptions,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象購買依頼（サーバー取得の view-model）。 */
  purchaseRequest?: PurchaseRequestView | null;
  /** 入荷先工場（有効のみ）。value = String(内部 id)。 */
  factoryOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const requestNumber =
    mode === "edit" ? purchaseRequest?.requestNumber : undefined;

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && purchaseRequest
        ? toFormValues(purchaseRequest)
        : {
            purpose: "",
            notes: "",
            items: [emptyItem()],
          },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        purpose: values.purpose,
        notes: values.notes,
        items: values.items.map((it) => ({
          materialId: it.materialId,
          factoryId: it.factoryId,
          quantity: it.quantity,
          unit: it.unit,
          desiredAt: it.desiredAt,
          notes: it.notes || null,
        })),
      };
      const result =
        mode === "edit" && requestNumber
          ? await updatePurchaseRequest(requestNumber, payload)
          : await createPurchaseRequest(payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? `購買依頼 ${result.data.requestNumber} を更新しました`
              : `購買依頼 ${result.data.requestNumber} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.requestNumber}`);
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
        "購買",
        { label: "購買依頼", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(requestNumber ? `${BASE_PATH}/${requestNumber}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && purchaseRequest ? (
          <StatusBadge
            entity="PurchaseRequest"
            status={purchaseRequest.status}
          />
        ) : undefined
      }
      title={
        mode === "edit"
          ? `購買依頼 編集 ${requestNumber ?? ""}`
          : "購買依頼 新規作成"
      }
    >
      <FormSection title="基本情報">
        <Textarea
          autosize
          label="依頼理由"
          minRows={2}
          placeholder="依頼理由・用途（任意）"
          {...form.getInputProps("purpose")}
        />
        <Textarea
          autosize
          label="備考"
          minRows={2}
          mt="sm"
          placeholder="備考（任意）"
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description="単価・仕入先は持ちません。承認後に発注書へ変換し、発注側で確定します。"
        title="明細"
      >
        <Group justify="flex-end" mb="xs">
          {typeof form.errors.items === "string" && (
            <Text c="red" size="xs">
              {form.errors.items}
            </Text>
          )}
        </Group>
        {form.values.items.map((item, ri) => (
          <Box key={item.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <Box flex={1}>
                <Group
                  align="flex-end"
                  gap="sm"
                  grow
                  preventGrowOverflow={false}
                >
                  <SearchSelect
                    error={form.errors[`items.${ri}.materialId`]}
                    initialOption={
                      item.materialId
                        ? { value: item.materialId, label: item.materialLabel }
                        : null
                    }
                    label="素材"
                    onChange={(v, opt) => {
                      form.setFieldValue(`items.${ri}.materialId`, v ?? "");
                      form.setFieldValue(
                        `items.${ri}.materialLabel`,
                        opt?.label ?? "",
                      );
                    }}
                    onSearch={searchMaterialOptions}
                    placeholder="素材を検索"
                    storageKey="material"
                    value={item.materialId || null}
                    withAsterisk
                  />
                  <Select
                    clearable
                    data={factoryOptions}
                    label="入荷先工場"
                    maw={180}
                    placeholder="工場を選択"
                    {...form.getInputProps(`items.${ri}.factoryId`)}
                  />
                  <NumberInput
                    decimalScale={3}
                    error={form.errors[`items.${ri}.quantity`]}
                    label="数量"
                    maw={110}
                    min={0}
                    {...form.getInputProps(`items.${ri}.quantity`)}
                    withAsterisk
                  />
                  <Select
                    data={UNIT_OPTIONS}
                    label="単位"
                    maw={90}
                    withAsterisk
                    {...form.getInputProps(`items.${ri}.unit`)}
                  />
                </Group>
              </Box>
              <ActionIcon
                aria-label="明細を削除"
                color="red"
                disabled={form.values.items.length <= 1}
                mb={4}
                onClick={() => form.removeListItem("items", ri)}
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            <Group align="flex-end" gap="sm" mt="xs">
              <DatePickerInput
                clearable
                label="希望納期"
                leftSection={<IconCalendar size={14} />}
                maw={200}
                placeholder="日付を選択"
                valueFormat="YYYY/MM/DD"
                {...form.getInputProps(`items.${ri}.desiredAt`)}
              />
              <TextInput
                flex={1}
                label="備考"
                placeholder="行の備考（任意）"
                {...form.getInputProps(`items.${ri}.notes`)}
              />
            </Group>
          </Box>
        ))}

        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="md"
          onClick={() => form.insertListItem("items", emptyItem())}
          size="xs"
        >
          明細を追加
        </GhostButton>
      </FormSection>
    </FormShell>
  );
}
