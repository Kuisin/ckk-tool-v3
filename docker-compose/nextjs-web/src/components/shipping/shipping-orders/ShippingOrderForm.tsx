"use client";

/**
 * ShippingOrderForm — 出荷書 新規作成 / 編集 (SH01, design.md §8.3).
 *
 * 新規: 注文請書 SearchSelect（必須）を選択すると、サーバーアクション
 * fetchShippingSourceInfo で注文請書情報 + 完了済み指示書（ロット）を取得し、
 * 明細を「完了指示書 1 件 = 1 行」（製品 = 受注製品 / ロット = 指示書番号 /
 * 数量 = 最終工程の良品数）で既定生成する。行は追加・削除可能
 * （追加行の製品は受注製品を既定、ロットは手入力任意）。
 * 種別（発送 / 在庫保管）・出荷元工場・備考をヘッダで指定する。
 *
 * 編集: 下書きのみ（ガードはサーバー側でも実施）。注文請書は作成後変更不可。
 */

import {
  ActionIcon,
  Alert,
  Box,
  Divider,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchProductOptions,
  searchSalesOrderOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createShippingOrder,
  fetchShippingSourceInfo,
  type ShippingSourceInfo,
  updateShippingOrder,
} from "@/app/(dashboard)/shipping/shipping-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { SHIPPING_TYPE_LABEL } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";
import type { ShippingOrder, ShippingType } from "./model";

const BASE_PATH = "/shipping/shipping-orders";

const SHIPPING_TYPES = ["DISPATCH", "STOCK_STORAGE"] as const;

const itemSchema = z.object({
  rowId: z.string(),
  productId: z.string().min(1, "製品を選択してください"),
  productName: z.string(),
  lotNumber: z.number().int().min(1).nullable(),
  quantity: z.number().int().min(1, "1以上"),
  notes: z.string(),
});

const schema = z.object({
  salesOrderId: z.string().min(1, "注文請書を選択してください"),
  type: z.enum(SHIPPING_TYPES),
  fromFactoryId: z.string().nullable(),
  notes: z.string(),
  items: z.array(itemSchema).min(1, "明細を1件以上追加してください"),
});

type FormValues = z.infer<typeof schema>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (
  productId = "",
  productName = "",
  lotNumber: number | null = null,
  quantity = 1,
): ItemForm => ({
  rowId: newRowId(),
  productId,
  productName,
  lotNumber,
  quantity,
  notes: "",
});

function toFormValues(order: ShippingOrder): FormValues {
  return {
    salesOrderId: order.salesOrderId,
    type: order.type,
    fromFactoryId: order.fromFactoryId,
    notes: order.notes ?? "",
    items: order.items.map((it) => ({
      rowId: newRowId(),
      productId: it.productId,
      productName: it.productName,
      lotNumber: it.lotNumber,
      quantity: it.quantity,
      notes: it.notes ?? "",
    })),
  };
}

export function ShippingOrderForm({
  mode,
  order,
  factoryOptions,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象出荷書（サーバー取得の view-model）。 */
  order?: ShippingOrder | null;
  /** 出荷元工場 options（サーバーロード）。value = String(内部 id)。 */
  factoryOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const orderId = mode === "edit" ? order?.id : undefined;

  // 選択中注文請書の情報（完了指示書・受注数量の案内表示用）。
  const [soInfo, setSoInfo] = useState<ShippingSourceInfo | null>(null);
  // 注文請書変更の競合ガード — 最後の要求のみ採用する。
  const soToken = useRef(0);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && order
        ? toFormValues(order)
        : {
            salesOrderId: "",
            type: "DISPATCH",
            fromFactoryId: null,
            notes: "",
            items: [emptyItem()],
          },
  });

  /**
   * 注文請書選択 → サーバーから受注情報 + 完了指示書を取得し、明細を
   * 「完了指示書 1 件 = 1 行」で既定生成する（完了指示書なしは空行1件）。
   */
  const onSalesOrderChange = (salesOrderId: string | null) => {
    form.setFieldValue("salesOrderId", salesOrderId ?? "");
    if (!salesOrderId) {
      setSoInfo(null);
      return;
    }
    const token = ++soToken.current;
    fetchShippingSourceInfo(salesOrderId).then((info) => {
      if (soToken.current !== token) return;
      setSoInfo(info);
      if (!info) return;
      const defaults =
        info.completedWorkOrders.length > 0
          ? info.completedWorkOrders.map((wo) =>
              emptyItem(
                info.productId,
                info.productName,
                wo.workOrderNumber,
                wo.outputQuantity,
              ),
            )
          : [emptyItem(info.productId, info.productName)];
      form.setFieldValue("items", defaults);
    });
  };

  const totalQuantity = form.values.items.reduce(
    (sum, it) => sum + it.quantity,
    0,
  );

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        type: values.type,
        fromFactoryId: values.fromFactoryId,
        notes: values.notes || null,
        items: values.items.map((it) => ({
          productId: it.productId,
          lotNumber: it.lotNumber,
          quantity: it.quantity,
          notes: it.notes || null,
        })),
      };
      const result =
        mode === "edit" && orderId
          ? await updateShippingOrder(orderId, payload)
          : await createShippingOrder({
              ...payload,
              salesOrderId: values.salesOrderId,
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? "出荷書を更新しました"
              : `出荷書 ${result.data.number} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
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
        "出荷",
        { label: "出荷書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(orderId ? `${BASE_PATH}/${orderId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && order ? (
          <StatusBadge entity="ShippingOrder" status={order.status} />
        ) : undefined
      }
      title={
        mode === "edit" ? `出荷書 編集 ${orderId ?? ""}` : "出荷書 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" ? (
            <SearchSelect
              error={form.errors.salesOrderId}
              label="注文請書"
              onChange={onSalesOrderChange}
              onSearch={searchSalesOrderOptions}
              placeholder="注文請書を検索"
              storageKey="sales-order"
              value={form.values.salesOrderId || null}
              withAsterisk
            />
          ) : (
            <FieldValue label="注文請書" value={order?.salesOrderNumber} />
          )}
          <Input.Wrapper label="種別" withAsterisk>
            <SegmentedControl
              data={SHIPPING_TYPES.map((t) => ({
                value: t,
                label: SHIPPING_TYPE_LABEL[t] ?? t,
              }))}
              fullWidth
              onChange={(v) => form.setFieldValue("type", v as ShippingType)}
              value={form.values.type}
            />
          </Input.Wrapper>
          <Select
            clearable
            data={factoryOptions}
            label="出荷元工場"
            placeholder="工場を選択"
            searchable={factoryOptions.length > 5}
            {...form.getInputProps("fromFactoryId")}
          />
          <Textarea
            autosize
            label="備考"
            minRows={1}
            placeholder="備考（任意）"
            {...form.getInputProps("notes")}
          />
        </SimpleGrid>
        {form.values.type === "STOCK_STORAGE" && (
          <Alert
            color="gray"
            icon={<IconInfoCircle size={16} />}
            mt="sm"
            variant="light"
          >
            在庫保管（予備製作分）は請求フロー外です。出荷しても注文請書の出荷状態は変わりません。
          </Alert>
        )}
      </FormSection>

      <FormSection
        description="注文請書を選択すると、完了済みの指示書（ロット）ごとに明細が既定生成されます（数量 = 最終工程の良品数、未記録は予定数量）。"
        title="明細"
      >
        {soInfo && (
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            mb="sm"
            variant="light"
          >
            {soInfo.salesOrderNumber}（{soInfo.customerName} /{" "}
            {soInfo.productName}）: 受注数量 {soInfo.quantity} · 完了指示書{" "}
            {soInfo.completedWorkOrders.length} 件
          </Alert>
        )}
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
                    error={form.errors[`items.${ri}.productId`]}
                    f4={PRODUCT_F4}
                    initialOption={
                      item.productId
                        ? { value: item.productId, label: item.productName }
                        : null
                    }
                    label="製品"
                    onChange={(v, opt) =>
                      form.setFieldValue(`items.${ri}`, {
                        ...item,
                        productId: v ?? "",
                        productName: opt?.label ?? "",
                      })
                    }
                    onSearch={searchProductOptions}
                    placeholder="製品を検索"
                    storageKey="product"
                    value={item.productId || null}
                    withAsterisk
                  />
                  <NumberInput
                    label="ロット番号"
                    maw={140}
                    min={1}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.lotNumber`,
                        typeof v === "number" ? v : null,
                      )
                    }
                    placeholder="指示書番号"
                    value={item.lotNumber ?? ""}
                  />
                  <NumberInput
                    error={form.errors[`items.${ri}.quantity`]}
                    label="数量"
                    maw={110}
                    min={1}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.quantity`,
                        typeof v === "number" ? v : 0,
                      )
                    }
                    value={item.quantity}
                    withAsterisk
                  />
                  <TextInput
                    label="備考"
                    placeholder="行の備考（任意）"
                    {...form.getInputProps(`items.${ri}.notes`)}
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
          </Box>
        ))}

        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="md"
          onClick={() =>
            form.insertListItem(
              "items",
              emptyItem(soInfo?.productId ?? "", soInfo?.productName ?? ""),
            )
          }
          size="xs"
        >
          明細を追加
        </GhostButton>

        <Divider my="md" />
        <Group justify="flex-end">
          <Text fw={700}>数量合計 {totalQuantity}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
