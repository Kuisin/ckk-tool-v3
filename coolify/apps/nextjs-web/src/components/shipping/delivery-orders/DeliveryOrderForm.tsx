"use client";

/**
 * DeliveryOrderForm — 出荷書 新規作成 / 編集 (SH01, design.md §8.3).
 *
 * 出荷元は**注文請書**で選ぶ — ヘッダの SearchSelect は「追加」用で、選ぶと
 * その注文請書の出荷できる注文明細すべてがグループとして増える。出荷書 ↔
 * 注文明細（SO）は m:n のまま（1 注文明細は複数の出荷書へ分割出荷できる）。
 * 既定行は未出荷数量を関連ロットへ自動割付した結果（allocateLotUsage）。
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
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchProductOptions,
  searchShippableAcceptanceOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createDeliveryOrder,
  type DeliverySourceInfo,
  fetchDeliveryAcceptanceSourceInfo,
  fetchDeliverySourceInfo,
  updateDeliveryOrder,
} from "@/app/(dashboard)/shipping/delivery-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { productF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { deliveryMethodLabel, deliveryOrderTypeLabel } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";
import {
  allocateLotUsage,
  combinabilityError,
  type DeliveryOrder,
  type DeliveryOrderType,
} from "./model";

const BASE_PATH = "/shipping/delivery-orders";

const DELIVERY_ORDER_TYPES = ["DISPATCH", "STOCK_STORAGE"] as const;

function buildSchema(tr: ReturnType<typeof useTranslations>) {
  const itemSchema = z.object({
    rowId: z.string(),
    /** 出荷元の注文明細（m:n — 1 出荷書に複数、1 注文明細も複数の出荷書へ）。 */
    orderLineId: z.string().nullable(),
    orderLineNumber: z.string().nullable(),
    productId: z
      .string()
      .min(1, tr("shipping.deliveryOrderForm.selectProduct")),
    productName: z.string(),
    lotNumber: z.number().int().min(1).nullable(),
    quantity: z.number().int().min(1, tr("common.mustBeAtLeastOne")),
    notes: z.string(),
  });

  return z.object({
    /** 顧客はヘッダが権威（1 出荷書 = 1 顧客）。 */
    customerBpId: z
      .string()
      .min(1, tr("shipping.deliveryOrderForm.selectAnOrderAcceptance")),
    type: z.enum(DELIVERY_ORDER_TYPES),
    fromPlantId: z.string().nullable(),
    notes: z.string(),
    items: z.array(itemSchema).min(1, tr("common.addAtLeastOneLineItem")),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
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
  initialAcceptance,
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
  /**
   * 新規時に `?acceptance=` でプリセレクトする注文請書番号（ORD-…。
   * 注文請書詳細 SA24 の「出荷書を作成」から来たとき）。ピッカーで選んだのと
   * 同じ経路で、出荷できる注文明細すべてをグループとして追加する。
   */
  initialAcceptance?: string | null;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const orderId = mode === "edit" ? order?.id : undefined;
  const schema = buildSchema(tr);

  // 注文明細ごとの受注情報（完了指示書・在庫ロット・受注数量）。
  // グループのロットピッカーは必ず**自分の注文明細**の情報から選択肢を作る。
  const [infoByLine, setInfoByLine] = useState<
    Record<string, DeliverySourceInfo>
  >({});

  // 注文請書ピッカー（グループ追加用）の選択値（ORD-…）— 追加後は空へ戻す。
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
   * 受注情報（注文明細 1 件ぶん × N）から明細グループを**追加**する。
   * 既定行は未出荷数量（受注数 − 出荷済）を関連ロットへ自動割付した結果
   * （allocateLotUsage — 指示書番号順に、自明細の取り分と現物在庫の範囲で
   * 必要数まで。統合ロットの出来高が必要数より多くても必要なぶんだけ載せる）。
   * 完了指示書なしは空行 1 件。既にあるグループ・出荷済みの明細はスキップ。
   */
  const addSourceGroups = (infos: DeliverySourceInfo[]) => {
    const first = infos[0];
    if (!first) return;
    // 束ね可否 — 同一顧客 × 同一出荷先 × 同一配送方法（注文請書ヘッダ由来）
    // だけを 1 出荷書に載せられる。既に載っているグループの属性
    // （infoByLine — 追加時 / 編集時のシードでロード済み）と比較する。
    // サーバー（validateCombinable）も同じ判定で最終ガードする。
    const existingRefs = form.values.items
      .map((it) => (it.orderLineId ? infoByLine[it.orderLineId] : null))
      .filter((i): i is DeliverySourceInfo => Boolean(i));
    const combineError = combinabilityError(
      [...existingRefs, first],
      tr,
      form.values.customerBpId || undefined,
    );
    if (combineError) {
      notifications.show({
        title: tr("shipping.deliveryOrders.cannotAdd"),
        message: combineError,
        color: "red",
      });
      return;
    }
    if (!form.values.customerBpId && first.customerBpId) {
      form.setFieldValue("customerBpId", first.customerBpId);
    }
    setInfoByLine((prev) => ({
      ...prev,
      ...Object.fromEntries(infos.map((i) => [i.orderLineId, i])),
    }));

    const newItems: ItemForm[] = [];
    const alreadyShipped: string[] = [];
    const shortfalls: string[] = [];
    for (const info of infos) {
      if (form.values.items.some((it) => it.orderLineId === info.orderLineId)) {
        continue; // 既にグループがある
      }
      const remaining = info.quantity - info.shippedQuantity;
      if (remaining <= 0) {
        alreadyShipped.push(info.orderLineNumber);
        continue;
      }
      // 未出荷数量を関連ロットへ自動割付（必要数までしか載せない）。
      const usage = allocateLotUsage(
        remaining,
        info.completedWorkOrders.map((wo) => ({
          lotNumber: wo.workOrderNumber,
          outputQuantity: wo.outputQuantity,
          stockQuantity:
            info.stockLots.find((l) => l.lotNumber === wo.workOrderNumber)
              ?.quantity ?? 0,
        })),
      );
      const defaults =
        usage.length > 0
          ? usage.map((u) =>
              emptyItem(
                info.productId,
                info.productName,
                u.lotNumber,
                u.quantity,
                info.orderLineId,
                info.orderLineNumber,
              ),
            )
          : [
              // 充当できるロットが無い（完了指示書なし・在庫なし）— 数量だけ
              // 残数で置き、ロットは手で選ばせる。
              emptyItem(
                info.productId,
                info.productName,
                null,
                remaining,
                info.orderLineId,
                info.orderLineNumber,
              ),
            ];
      const covered = usage.reduce((sum, u) => sum + u.quantity, 0);
      if (usage.length > 0 && covered < remaining) {
        shortfalls.push(
          tr("shipping.deliveryOrderForm.shortfallLine", {
            orderLineNumber: info.orderLineNumber,
            remaining,
            covered,
          }),
        );
      }
      newItems.push(...defaults);
    }

    if (newItems.length > 0) {
      form.setFieldValue("items", [...form.values.items, ...newItems]);
    }
    if (alreadyShipped.length > 0) {
      notifications.show({
        title: tr("shipping.deliveryOrders.linesAlreadyShippedWereSkipped"),
        message: tr("shipping.deliveryOrderForm.alreadyShippedMessage", {
          lines: alreadyShipped.join("、"),
        }),
        color: "orange",
      });
    }
    if (shortfalls.length > 0) {
      notifications.show({
        title: tr("shipping.deliveryOrders.thereIsNotEnoughStock"),
        message: tr("shipping.deliveryOrderForm.shortfallMessage", {
          lines: shortfalls.join("、"),
        }),
        color: "orange",
      });
    }
  };

  /** 注文請書を選ぶ → 出荷できる注文明細すべてをグループとして追加する。 */
  const onAcceptancePick = (acceptanceNumber: string | null) => {
    setPickedLineId(acceptanceNumber ?? "");
    if (!acceptanceNumber) return;
    fetchDeliveryAcceptanceSourceInfo(acceptanceNumber).then((infos) => {
      if (infos.length === 0) {
        notifications.show({
          title: tr("shipping.deliveryOrders.cannotAdd"),
          message: tr("shipping.deliveryOrders.thereAreNoOrderLinesReady"),
          color: "red",
        });
        return;
      }
      addSourceGroups(infos);
      setPickedLineId("");
    });
  };

  // 新規 + `?orderLine=` — 未処理出荷書（SH03）の「出荷書作成」から来たとき、
  // その注文明細 1 件だけを注文請書ピッカーと同じ経路で 1 度だけ追加する。
  // 依存配列を持たない（毎レンダー実行）代わりに ref で 1 回に絞る — form も
  // addSourceGroups も毎レンダー作り直されるので依存に載せられないため。
  const seeded = useRef(false);
  useEffect(() => {
    if (
      mode !== "create" ||
      (!initialOrderLine && !initialAcceptance) ||
      seeded.current
    )
      return;
    seeded.current = true;
    if (initialOrderLine) {
      fetchDeliverySourceInfo(initialOrderLine.id).then((info) => {
        if (info) {
          addSourceGroups([info]);
        } else {
          // 黙って空フォームにしない — 未確定・製品未特定などで読めなかった
          // ことを伝える（プリフィルが「効いていない」ように見えるため）。
          notifications.show({
            title: tr("shipping.deliveryOrders.couldNotLoadTheOrderLines"),
            message: tr("shipping.deliveryOrderForm.couldNotAddOrderLine", {
              label: initialOrderLine.label,
            }),
            color: "red",
          });
        }
      });
    } else if (initialAcceptance) {
      fetchDeliveryAcceptanceSourceInfo(initialAcceptance).then((infos) => {
        if (infos.length > 0) {
          addSourceGroups(infos);
        } else {
          notifications.show({
            title: tr("shipping.deliveryOrders.cannotAdd"),
            message: tr("shipping.deliveryOrders.thereAreNoOrderLinesReady"),
            color: "red",
          });
        }
      });
    }
  });

  const totalQuantity = form.values.items.reduce(
    (sum, it) => sum + it.quantity,
    0,
  );

  const groups = groupItems(form.values.items);

  /**
   * 注文明細グループごとの数量チェック（DISPATCH のみ・受注情報のある
   * グループのみ）。remaining = 受注数 − 出荷済（SHIPPED のみ集計）、
   * coverable = 完了指示書の現物在庫から自明細の取り分の範囲で引当できる数量。
   */
  const groupQuantityChecks = () =>
    groups
      .filter((g) => g.orderLineId)
      .flatMap((g) => {
        const info = infoByLine[g.orderLineId as string];
        if (!info) return [];
        const total = g.rows.reduce((sum, r) => sum + r.item.quantity, 0);
        const remaining = info.quantity - info.shippedQuantity;
        const coverable = allocateLotUsage(
          remaining,
          info.completedWorkOrders.map((wo) => ({
            lotNumber: wo.workOrderNumber,
            outputQuantity: wo.outputQuantity,
            stockQuantity:
              info.stockLots.find((l) => l.lotNumber === wo.workOrderNumber)
                ?.quantity ?? 0,
          })),
        ).reduce((sum, u) => sum + u.quantity, 0);
        return [{ number: info.orderLineNumber, total, remaining, coverable }];
      });

  const doSubmit = (values: FormValues) => {
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
          title: tr("common.saved2"),
          message:
            mode === "edit"
              ? tr("shipping.deliveryOrders.theDeliveryOrderWasUpdated")
              : tr("shipping.deliveryOrderForm.createdWithNumber", {
                  number: result.data.number,
                }),
          color: "green",
        });
        // 保存後は必ず**詳細（閲覧）画面**へ。フォームが dirty のままだと
        // 離脱ガードや再送信の余地が残るため、遷移前にリセットする。
        form.resetDirty();
        router.push(`${BASE_PATH}/${result.data.number}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleSubmit = (values: FormValues) => {
    // 在庫保管（STOCK_STORAGE）は受注数量と独立 — チェックは発送のみ。
    if (values.type !== "DISPATCH") {
      doSubmit(values);
      return;
    }
    const checks = groupQuantityChecks();
    // 受注残を超える出荷はブロック（サーバー側 validateLineRemaining と同じ規則）
    const over = checks.filter((c) => c.total > c.remaining);
    if (over.length > 0) {
      notifications.show({
        title: tr("shipping.deliveryOrders.itExceedsTheOrderedQuantity"),
        message: tr(
          "shipping.deliveryOrderForm.exceedsOrderedQuantityMessage",
          {
            lines: over
              .map((c) =>
                tr("shipping.deliveryOrderForm.exceedsOrderedQuantityLine", {
                  number: c.number,
                  remaining: c.remaining,
                  total: c.total,
                }),
              )
              .join("、"),
          },
        ),
        color: "red",
      });
      return;
    }
    // 一部出荷（受注残に満たない）/ 完成品不足は警告 + 確認してから保存
    const partial = checks.filter((c) => c.total < c.remaining);
    const notReady = checks.filter((c) => c.coverable < c.remaining);
    if (partial.length === 0 && notReady.length === 0) {
      doSubmit(values);
      return;
    }
    modals.openConfirmModal({
      title: tr("shipping.deliveryOrders.confirmPartialShipment"),
      children: (
        <Box>
          {notReady.map((c) => (
            <Text key={`nr-${c.number}`} size="sm">
              {tr("shipping.deliveryOrderForm.notEnoughFinishedGoodsLine", {
                number: c.number,
                coverable: c.coverable,
                remaining: c.remaining,
              })}
            </Text>
          ))}
          {partial.map((c) => (
            <Text key={`pt-${c.number}`} size="sm">
              {tr("shipping.deliveryOrderForm.partialShipmentLine", {
                number: c.number,
                total: c.total,
                remaining: c.remaining,
              })}
            </Text>
          ))}
          <Text c="dimmed" mt="xs" size="sm">
            {tr("shipping.deliveryOrders.savingAsItIsMakesThis")}
          </Text>
        </Box>
      ),
      labels: {
        confirm: tr("shipping.deliveryOrders.saveAsAPartialShipment"),
        cancel: tr("common.back2"),
      },
      onConfirm: () => doSubmit(values),
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
              f4={productF4(tr)}
              initialOption={
                item.productId
                  ? { value: item.productId, label: item.productName }
                  : null
              }
              label={
                <HelpLabel {...fieldHelp(tr, "deliveryOrder", "product")} />
              }
              onChange={(v, opt) =>
                form.setFieldValue(`items.${ri}`, {
                  ...item,
                  productId: v ?? "",
                  productName: opt?.label ?? "",
                })
              }
              onSearch={searchProductOptions}
              placeholder={tr("common.searchProducts")}
              storageKey="product"
              value={item.productId || null}
            />
            {form.values.type === "DISPATCH" && lotOptions.length > 0 ? (
              <Select
                clearable
                data={lotOptions.map((lot) => ({
                  value: String(lot.lotNumber),
                  label:
                    lot.reserved > 0
                      ? tr("shipping.deliveryOrderForm.lotOptionWithReserved", {
                          lotNumber: lot.lotNumber,
                          quantity: lot.quantity,
                          reserved: lot.reserved,
                        })
                      : tr("shipping.deliveryOrderForm.lotOption", {
                          lotNumber: lot.lotNumber,
                          quantity: lot.quantity,
                        }),
                }))}
                label={tr("shipping.deliveryOrders.lotsWorkOrdersForThisOrder")}
                maw={240}
                onChange={(v) =>
                  form.setFieldValue(
                    `items.${ri}.lotNumber`,
                    v ? Number(v) : null,
                  )
                }
                placeholder={tr("shipping.deliveryOrders.selectALot")}
                searchable
                value={item.lotNumber != null ? String(item.lotNumber) : null}
              />
            ) : (
              <NumberInput
                label={tr("common.lotNumber")}
                maw={140}
                min={1}
                onChange={(v) =>
                  form.setFieldValue(
                    `items.${ri}.lotNumber`,
                    typeof v === "number" ? v : null,
                  )
                }
                placeholder={tr("common.workOrderNumber")}
                value={item.lotNumber ?? ""}
              />
            )}
            <NumberInput
              error={form.errors[`items.${ri}.quantity`]}
              label={
                <HelpLabel {...fieldHelp(tr, "deliveryOrder", "quantity")} />
              }
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
              label={<HelpLabel {...fieldHelp(tr, "deliveryOrder", "notes")} />}
              placeholder={tr("common.lineNotesOptional")}
              {...form.getInputProps(`items.${ri}.notes`)}
            />
          </Group>
        </Box>
        <ActionIcon
          aria-label={tr("common.removeLine")}
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
        tr("common.shipping"),
        { label: tr("common.deliveryOrder"), href: BASE_PATH },
        mode === "edit" ? tr("common.edit") : tr("common.new2"),
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
        mode === "edit"
          ? tr("shipping.deliveryOrderForm.editWithNumber", {
              orderId: orderId ?? "",
            })
          : tr("shipping.deliveryOrders.newDeliveryOrder")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {/* 注文請書ピッカー — 選ぶたびに、その注文請書の出荷できる
              注文明細がグループとして**追加**される（m:n）。 */}
          <SearchSelect
            error={form.errors.customerBpId}
            label={
              <HelpLabel {...fieldHelp(tr, "deliveryOrder", "orderLine")} />
            }
            onChange={onAcceptancePick}
            onSearch={searchShippableAcceptanceOptions}
            placeholder={tr(
              "shipping.deliveryOrders.searchOrderAcceptancesAndAddLines",
            )}
            storageKey="order-acceptance"
            value={pickedLineId || null}
            withAsterisk={mode === "create"}
          />
          <Input.Wrapper
            label={<HelpLabel {...fieldHelp(tr, "deliveryOrder", "type")} />}
            withAsterisk
          >
            <SegmentedControl
              data={DELIVERY_ORDER_TYPES.map((t) => ({
                value: t,
                label: deliveryOrderTypeLabel(t, locale) ?? t,
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
            label={<HelpLabel {...fieldHelp(tr, "deliveryOrder", "plant")} />}
            placeholder={tr("common.selectASite")}
            searchable={plantOptions.length > 5}
            {...form.getInputProps("fromPlantId")}
          />
          <Textarea
            autosize
            label={<HelpLabel {...fieldHelp(tr, "deliveryOrder", "notes")} />}
            minRows={1}
            placeholder={tr("common.notesOptional")}
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
            {tr(
              "shipping.deliveryOrders.stockStorageSpareProductionSitsOutside",
            )}
          </Alert>
        )}
      </FormSection>

      <FormSection
        description={tr(
          "shipping.deliveryOrders.choosingAnOrderAcceptanceAddsA",
        )}
        title={tr("common.lineItems")}
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
            {tr("shipping.deliveryOrders.searchUnderOrderLinesAboveAnd")}
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
                          {/* 束ねの条件（出荷先・配送方法）が見えるようにする */}
                          {[
                            `${info.customerName} / ${info.productName}`,
                            info.shipToName
                              ? `${tr("sales.orderAcceptances.shipTo")} ${info.shipToName}`
                              : null,
                            info.deliveryMethod === "DIRECT_TO_USER"
                              ? deliveryMethodLabel("DIRECT_TO_USER", locale)
                              : null,
                            tr(
                              "shipping.deliveryOrderForm.orderedQuantityLabel",
                              {
                                quantity: info.quantity,
                              },
                            ),
                            info.shippedQuantity > 0
                              ? tr(
                                  "shipping.deliveryOrderForm.shippedQuantityLabel",
                                  { quantity: info.shippedQuantity },
                                )
                              : null,
                            // 完成 = 接続された指示書の完成数のうちこの明細への配分
                            // （distributeFinished）— DO の数量はこれが源泉
                            tr(
                              "shipping.deliveryOrderForm.completedQuantityLabel",
                              {
                                quantity: info.completedWorkOrders.reduce(
                                  (sum, wo) => sum + wo.outputQuantity,
                                  0,
                                ),
                                count: info.completedWorkOrders.length,
                              },
                            ),
                          ]
                            .filter((part): part is string => Boolean(part))
                            .join(" · ")}
                        </Text>
                      )}
                      {info &&
                        form.values.type === "DISPATCH" &&
                        (() => {
                          const total = group.rows.reduce(
                            (sum, r) => sum + r.item.quantity,
                            0,
                          );
                          const remaining =
                            info.quantity - info.shippedQuantity;
                          if (total > remaining) {
                            return (
                              <Text c="red" fw={600} size="xs">
                                {tr(
                                  "shipping.deliveryOrderForm.exceedsRemainingLabel",
                                  { remaining, total },
                                )}
                              </Text>
                            );
                          }
                          if (total < remaining) {
                            return (
                              <Text c="orange" size="xs">
                                {tr(
                                  "shipping.deliveryOrderForm.partialShipmentLabel",
                                  { total, remaining },
                                )}
                              </Text>
                            );
                          }
                          return null;
                        })()}
                    </>
                  ) : (
                    <Text c="dimmed" fw={600} size="sm">
                      {tr("shipping.deliveryOrders.noOrderLineStockStorageEtc")}
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
                  {tr("common.addRow")}
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
            {tr("shipping.deliveryOrders.addALineNoOrderLine")}
          </GhostButton>
        )}

        <Divider my="md" />
        <Group justify="flex-end">
          <Text fw={700}>
            {tr("common.totalQuantity")} {totalQuantity}
          </Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
