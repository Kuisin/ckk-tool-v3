"use client";

/**
 * DeliveryOrderForm — 出荷書 新規作成 / 編集 (SH01, design.md §8.3).
 *
 * 出荷書 ↔ 注文明細（SO）は m:n — ヘッダの SearchSelect は「追加」用で、
 * 選ぶたびに注文明細グループが増える（1 注文明細は複数の出荷書へ分割出荷
 * できる）。明細は注文明細ごとのグループで編集し、既定行は
 * fetchDeliverySourceInfo が返す「完了指示書 1 件 = 1 行」（製品 = 受注製品 /
 * ロット = 指示書番号 / 数量 = 最終工程の残良品数）。
 *
 * 指示書（ロット）は**その行の注文明細に紐づく完了指示書**から選ぶ —
 * グループごとに取得した stockLots が選択肢で、他の受注のロットは出ない
 * （他ロットを充てたいときは先に FROM_STOCK の在庫引当指示書で紐づける）。
 *
 * 営業担当は出荷書に保存しない（注文請書ヘッダから導出）ため入力欄も無い。
 *
 * 編集: 下書きのみ（ガードはサーバー側でも実施）。
 */

import {
  ActionIcon,
  Alert,
  Box,
  Divider,
  Group,
  Input,
  NumberInput,
  Paper,
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
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchOrderLineOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createDeliveryOrder,
  type DeliverySourceInfo,
  fetchDeliverySourceInfo,
  updateDeliveryOrder,
} from "@/app/(dashboard)/shipping/delivery-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { DELIVERY_ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";
import type { DeliveryOrder, DeliveryOrderType } from "./model";

const BASE_PATH = "/shipping/delivery-orders";

const DELIVERY_ORDER_TYPES = ["DISPATCH", "STOCK_STORAGE"] as const;

const itemSchema = z.object({
  rowId: z.string(),
  /** 出荷元の注文明細（m:n — 1 出荷書に複数、1 注文明細も複数の出荷書へ）。 */
  orderLineId: z.string().nullable(),
  orderLineNumber: z.string().nullable(),
  productId: z.string().min(1, "製品を選択してください"),
  productName: z.string(),
  lotNumber: z.number().int().min(1).nullable(),
  quantity: z.number().int().min(1, "1以上"),
  notes: z.string(),
});

const schema = z.object({
  /** 顧客はヘッダが権威（1 出荷書 = 1 顧客）。 */
  customerBpId: z.string().min(1, "注文明細を選択してください"),
  type: z.enum(DELIVERY_ORDER_TYPES),
  fromPlantId: z.string().nullable(),
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
  orderLineId: string | null = null,
  orderLineNumber: string | null = null,
): ItemForm => ({
  rowId: newRowId(),
  orderLineId,
  orderLineNumber,
  productId,
  productName,
  lotNumber,
  quantity,
  notes: "",
});

function toFormValues(order: DeliveryOrder): FormValues {
  return {
    customerBpId: order.customerId,
    type: order.type,
    fromPlantId: order.fromPlantId,
    notes: order.notes ?? "",
    items: order.items.map((it) => ({
      rowId: newRowId(),
      orderLineId: it.orderLineId,
      orderLineNumber: it.orderLineNumber,
      productId: it.productId,
      productName: it.productName,
      lotNumber: it.lotNumber,
      quantity: it.quantity,
      notes: it.notes ?? "",
    })),
  };
}

/** 表示用グループ: 注文明細ごと（orderLineId 無しの行は末尾の 1 グループ）。 */
interface ItemGroup {
  key: string;
  orderLineId: string | null;
  orderLineNumber: string | null;
  rows: { item: ItemForm; index: number }[];
}

function groupItems(items: ItemForm[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  items.forEach((item, index) => {
    const key = item.orderLineId ?? "__none__";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        orderLineId: item.orderLineId,
        orderLineNumber: item.orderLineNumber,
        rows: [],
      };
      groups.push(g);
    }
    g.rows.push({ item, index });
  });
  // 注文明細なしグループは常に末尾へ。
  return groups.sort(
    (a, b) => Number(a.orderLineId == null) - Number(b.orderLineId == null),
  );
}

export function DeliveryOrderForm({
  mode,
  order,
  plantOptions,
  initialOrderLine,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象出荷書（サーバー取得の view-model）。 */
  order?: DeliveryOrder | null;
  /** 出荷元拠点 options（サーバーロード）。value = String(内部 id)。 */
  plantOptions: Option[];
  /**
   * 新規時に `?orderLine=` でプリセレクトする注文明細（未処理出荷書 SH03 の
   * 「出荷書作成」から来たとき）。ピッカーで選んだのと同じ経路を通す。
   */
  initialOrderLine?: { id: string; label: string } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const orderId = mode === "edit" ? order?.id : undefined;

  // 注文明細ごとの受注情報（完了指示書・在庫ロット・受注数量）。
  // グループのロットピッカーは必ず**自分の注文明細**の情報から選択肢を作る。
  const [infoByLine, setInfoByLine] = useState<
    Record<string, DeliverySourceInfo>
  >({});

  // ピッカー（グループ追加用）の選択値 — 追加後は空へ戻す。
  const [pickedLineId, setPickedLineId] = useState<string>("");

  const loadInfo = (lineId: string) => {
    fetchDeliverySourceInfo(lineId).then((info) => {
      if (info) setInfoByLine((prev) => ({ ...prev, [lineId]: info }));
    });
  };

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && order
        ? toFormValues(order)
        : {
            customerBpId: "",
            type: "DISPATCH",
            fromPlantId: null,
            notes: "",
            items: [],
          },
  });

  // 編集時: 既存明細の注文明細すべてについてロット情報をロードする
  // （旧実装は先頭行の注文明細だけで、他グループのロット選択肢が壊れていた）。
  const editSeeded = useRef(false);
  useEffect(() => {
    if (mode !== "edit" || !order || editSeeded.current) return;
    editSeeded.current = true;
    const ids = [
      ...new Set(
        order.items
          .map((it) => it.orderLineId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    ids.forEach(loadInfo);
  });

  /**
   * 注文明細を選ぶ → 受注情報を取得してグループを**追加**する
   * （完了指示書 1 件 = 1 行。完了指示書なしは空行 1 件）。
   * 既に同じ注文明細のグループがあるときは何もしない。
   */
  const onOrderLinePick = (orderLineId: string | null) => {
    setPickedLineId(orderLineId ?? "");
    if (!orderLineId) return;
    fetchDeliverySourceInfo(orderLineId).then((info) => {
      if (!info) {
        notifications.show({
          title: "追加できません",
          message: "確定済みの注文明細を選択してください",
          color: "red",
        });
        return;
      }
      setInfoByLine((prev) => ({ ...prev, [orderLineId]: info }));
      // 1 出荷書 = 1 顧客 — 最初に選んだ注文明細の顧客で確定する。
      if (
        form.values.customerBpId &&
        info.customerBpId &&
        info.customerBpId !== form.values.customerBpId
      ) {
        notifications.show({
          title: "追加できません",
          message: "1 つの出荷書には同じ顧客の注文明細だけを載せられます",
          color: "red",
        });
        return;
      }
      if (!form.values.customerBpId && info.customerBpId) {
        form.setFieldValue("customerBpId", info.customerBpId);
      }
      if (form.values.items.some((it) => it.orderLineId === info.orderLineId)) {
        setPickedLineId("");
        return;
      }
      const defaults =
        info.completedWorkOrders.length > 0
          ? info.completedWorkOrders.map((wo) =>
              emptyItem(
                info.productId,
                info.productName,
                wo.workOrderNumber,
                wo.outputQuantity,
                info.orderLineId,
                info.orderLineNumber,
              ),
            )
          : [
              emptyItem(
                info.productId,
                info.productName,
                null,
                1,
                info.orderLineId,
                info.orderLineNumber,
              ),
            ];
      form.setFieldValue("items", [...form.values.items, ...defaults]);
      setPickedLineId("");
    });
  };

  // 新規 + `?orderLine=` — ピッカーで選んだのと同じ初期化を 1 度だけ走らせる。
  // 依存配列を持たない（毎レンダー実行）代わりに ref で 1 回に絞る — form も
  // onOrderLinePick も毎レンダー作り直されるので依存に載せられないため。
  const seeded = useRef(false);
  useEffect(() => {
    if (mode !== "create" || !initialOrderLine || seeded.current) return;
    seeded.current = true;
    onOrderLinePick(initialOrderLine.id);
  });

  const totalQuantity = form.values.items.reduce(
    (sum, it) => sum + it.quantity,
    0,
  );

  const groups = groupItems(form.values.items);

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        type: values.type,
        fromPlantId: values.fromPlantId,
        notes: values.notes || null,
        items: values.items.map((it) => ({
          orderLineId: it.orderLineId,
          productId: it.productId,
          lotNumber: it.lotNumber,
          quantity: it.quantity,
          notes: it.notes || null,
        })),
      };
      const result =
        mode === "edit" && orderId
          ? await updateDeliveryOrder(orderId, payload)
          : await createDeliveryOrder({
              ...payload,
              customerBpId: values.customerBpId,
              customerBranchBpId: null,
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
        // 保存後は必ず**詳細（閲覧）画面**へ。フォームが dirty のままだと
        // 離脱ガードや再送信の余地が残るため、遷移前にリセットする。
        form.resetDirty();
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

  const renderRow = (group: ItemGroup, item: ItemForm, ri: number) => {
    const info = group.orderLineId ? infoByLine[group.orderLineId] : undefined;
    const lotOptions = info?.stockLots ?? [];
    return (
      <Group align="flex-end" gap="sm" key={item.rowId} wrap="nowrap">
        <Box flex={1}>
          <Group align="flex-end" gap="sm" grow preventGrowOverflow={false}>
            <SearchSelect
              error={form.errors[`items.${ri}.productId`]}
              f4={PRODUCT_F4}
              initialOption={
                item.productId
                  ? { value: item.productId, label: item.productName }
                  : null
              }
              label={<HelpLabel {...fieldHelp("deliveryOrder", "product")} />}
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
            />
            {form.values.type === "DISPATCH" && lotOptions.length > 0 ? (
              <Select
                clearable
                data={lotOptions.map((lot) => ({
                  value: String(lot.lotNumber),
                  label: `#${lot.lotNumber}（現物 ${lot.quantity}${
                    lot.reserved > 0 ? ` / 予約 ${lot.reserved}` : ""
                  }）`,
                }))}
                label="ロット（この注文明細の指示書）"
                maw={240}
                onChange={(v) =>
                  form.setFieldValue(
                    `items.${ri}.lotNumber`,
                    v ? Number(v) : null,
                  )
                }
                placeholder="ロットを選択"
                searchable
                value={item.lotNumber != null ? String(item.lotNumber) : null}
              />
            ) : (
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
            )}
            <NumberInput
              error={form.errors[`items.${ri}.quantity`]}
              label={<HelpLabel {...fieldHelp("deliveryOrder", "quantity")} />}
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
              label={<HelpLabel {...fieldHelp("deliveryOrder", "notes")} />}
              placeholder="行の備考（任意）"
              {...form.getInputProps(`items.${ri}.notes`)}
            />
          </Group>
        </Box>
        <ActionIcon
          aria-label="明細を削除"
          color="red"
          mb={4}
          onClick={() => form.removeListItem("items", ri)}
          variant="subtle"
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    );
  };

  return (
    <FormShell
      breadcrumbs={[
        "出荷",
        { label: "出荷書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(orderId ? `${BASE_PATH}/${orderId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && order ? (
          <StatusBadge entity="DeliveryOrder" status={order.status} />
        ) : undefined
      }
      title={
        mode === "edit" ? `出荷書 編集 ${orderId ?? ""}` : "出荷書 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {/* 注文明細ピッカー — 選ぶたびにグループを**追加**する（m:n）。 */}
          <SearchSelect
            error={form.errors.customerBpId}
            initialOption={
              mode === "create" && initialOrderLine
                ? {
                    value: initialOrderLine.id,
                    label: initialOrderLine.label,
                  }
                : undefined
            }
            label={<HelpLabel {...fieldHelp("deliveryOrder", "orderLine")} />}
            onChange={onOrderLinePick}
            onSearch={searchOrderLineOptions}
            placeholder="注文明細を検索して明細を追加"
            storageKey="order-line"
            value={pickedLineId || null}
            withAsterisk={mode === "create"}
          />
          <Input.Wrapper
            label={<HelpLabel {...fieldHelp("deliveryOrder", "type")} />}
            withAsterisk
          >
            <SegmentedControl
              data={DELIVERY_ORDER_TYPES.map((t) => ({
                value: t,
                label: DELIVERY_ORDER_TYPE_LABEL[t] ?? t,
              }))}
              fullWidth
              onChange={(v) =>
                form.setFieldValue("type", v as DeliveryOrderType)
              }
              value={form.values.type}
            />
          </Input.Wrapper>
          <Select
            clearable
            data={plantOptions}
            label={<HelpLabel {...fieldHelp("deliveryOrder", "plant")} />}
            placeholder="拠点を選択"
            searchable={plantOptions.length > 5}
            {...form.getInputProps("fromPlantId")}
          />
          <Textarea
            autosize
            label={<HelpLabel {...fieldHelp("deliveryOrder", "notes")} />}
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
            在庫保管（予備製作分）は請求フロー外です。出荷しても注文明細の出荷状態は変わりません。
          </Alert>
        )}
      </FormSection>

      <FormSection
        description="注文明細を選択すると、完了済みの指示書（ロット）ごとに明細が既定生成されます（数量 = 残良品数、未記録は予定数量）。ロットはその注文明細に紐づく指示書から選択し、在庫数に対して検証されます。"
        title="明細"
      >
        <Group justify="flex-end" mb="xs">
          {typeof form.errors.items === "string" && (
            <Text c="red" size="xs">
              {form.errors.items}
            </Text>
          )}
        </Group>

        {groups.length === 0 && (
          <Text c="dimmed" py="md" size="sm" ta="center">
            上の「注文明細」を検索して明細を追加してください
          </Text>
        )}

        {groups.map((group, gi) => {
          const info = group.orderLineId
            ? infoByLine[group.orderLineId]
            : undefined;
          return (
            <Paper key={group.key} mt={gi > 0 ? "md" : 0} p="sm" withBorder>
              <Group gap="sm" justify="space-between" mb="xs" wrap="wrap">
                <Group gap="sm" wrap="wrap">
                  {group.orderLineId ? (
                    <>
                      <DocNumber>
                        {info?.orderLineNumber ?? group.orderLineNumber ?? "—"}
                      </DocNumber>
                      {info && (
                        <Text c="dimmed" size="xs">
                          {info.customerName} / {info.productName} · 受注{" "}
                          {info.quantity}
                          {info.shippedQuantity > 0
                            ? ` · 出荷済 ${info.shippedQuantity}`
                            : ""}{" "}
                          · 完了指示書 {info.completedWorkOrders.length} 件
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text c="dimmed" fw={600} size="sm">
                      注文明細なし（在庫保管など）
                    </Text>
                  )}
                </Group>
                <GhostButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    form.insertListItem(
                      "items",
                      emptyItem(
                        info?.productId ?? "",
                        info?.productName ?? "",
                        null,
                        1,
                        group.orderLineId,
                        info?.orderLineNumber ?? group.orderLineNumber,
                      ),
                    )
                  }
                  size="xs"
                >
                  行を追加
                </GhostButton>
              </Group>
              <Box>
                {group.rows.map(({ item, index }, i) => (
                  <Box key={item.rowId}>
                    {i > 0 && <Divider my="sm" />}
                    {renderRow(group, item, index)}
                  </Box>
                ))}
              </Box>
            </Paper>
          );
        })}

        {form.values.type === "STOCK_STORAGE" && (
          <GhostButton
            leftSection={<IconPlus size={16} />}
            mt="md"
            onClick={() => form.insertListItem("items", emptyItem())}
            size="xs"
          >
            明細を追加（注文明細なし）
          </GhostButton>
        )}

        <Divider my="md" />
        <Group justify="flex-end">
          <Text fw={700}>数量合計 {totalQuantity}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
