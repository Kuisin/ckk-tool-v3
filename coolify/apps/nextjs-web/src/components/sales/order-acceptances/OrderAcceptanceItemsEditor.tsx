"use client";

/**
 * OrderAcceptanceItemsEditor — 注文請書明細の行エディタ（SA04）。
 *
 * DRAFT 詳細のインライン編集と手入力（MANUAL）新規作成の両方で使う。
 * 各行: 製品 SearchSelect（未突合可 — 未選択は「製品未特定」バッジ）+
 * 品名テキスト（抽出の生テキスト）+ 種別 + 数量 + 単価（未入力可）+
 * 納期 + 備考。追加 / 削除可。バリデーションはサーバー側
 * （actions.ts の zod + 展開時の突合チェック）が最終ガード。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import type { OrderAcceptanceDraftInput } from "@/app/(dashboard)/sales/order-acceptances/actions";
import { GhostButton } from "@/components/ui/buttons";
import { productF4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { orderTypeOptions } from "@/lib/enum-labels";
import { formatMoney } from "@/lib/format";
import { acceptanceTotals } from "@/lib/order-acceptance-totals";
import { MatchSuggestions } from "./MatchSuggestions";
import type { MatchSuggestion, OrderAcceptanceItemView } from "./model";

const ORDER_TYPES = ["PRODUCTION", "TEST", "SAMPLE", "OTHER"] as const;
type OrderType = (typeof ORDER_TYPES)[number];

/**
 * 保存済み明細行の価格照合結果（クライアント向け最小形 —
 * app/(dashboard)/sales/order-acceptances/price-check.ts 由来）。
 */
export interface ItemPriceCheck {
  /** 価格表から解決した期待単価（未解決は null）。 */
  expected: number | null;
  /** 入力単価が価格表と不一致。 */
  diff: boolean;
  /** 製品突合済みだが価格表エントリなし。 */
  unpriced: boolean;
}

/** エディタ 1 行のフォーム値。 */
export interface ItemRowForm {
  rowId: string;
  /** 保存済み行の order_acceptance_items.id（未保存の追加行は null）。 */
  itemId: string | null;
  productId: string | null;
  /** SearchSelect の初期表示用ラベル（突合済みのとき）。 */
  productLabel: string | null;
  productText: string;
  /** 未突合のときの候補（lib/product-match）。手で足した行は空。 */
  productSuggestions: MatchSuggestion[];
  orderType: OrderType;
  quantity: number;
  unitPrice: number | null;
  deliveryDate: string | null;
  notes: string;
}

let rowSeq = 0;
const newRowId = () => `item-${++rowSeq}-${Date.now()}`;

export const newItemRow = (): ItemRowForm => ({
  rowId: newRowId(),
  itemId: null,
  productId: null,
  productLabel: null,
  productText: "",
  productSuggestions: [],
  orderType: "PRODUCTION",
  quantity: 1,
  unitPrice: null,
  deliveryDate: null,
  notes: "",
});

/** サーバー view → エディタ行。 */
export function toItemRows(items: OrderAcceptanceItemView[]): ItemRowForm[] {
  return items.map((it) => ({
    rowId: newRowId(),
    itemId: it.id,
    productId: it.productId,
    productLabel: it.productLabel,
    productText: it.productText ?? "",
    productSuggestions: it.productSuggestions,
    orderType: (ORDER_TYPES as readonly string[]).includes(it.orderType)
      ? (it.orderType as OrderType)
      : "PRODUCTION",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    deliveryDate: it.deliveryDate,
    notes: it.notes ?? "",
  }));
}

/** エディタ行 → Server Action 入力。 */
export function toItemPayload(
  rows: ItemRowForm[],
): OrderAcceptanceDraftInput["items"] {
  return rows.map((r) => ({
    productId: r.productId,
    productText: r.productText || null,
    orderType: r.orderType,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    deliveryDate: r.deliveryDate,
    notes: r.notes || null,
  }));
}

export function OrderAcceptanceItemsEditor({
  items,
  onChange,
  lineChecks,
}: {
  items: ItemRowForm[];
  onChange: (items: ItemRowForm[]) => void;
  /** 保存済み行の価格照合結果（itemId → 結果）。保存内容に対する照合。 */
  lineChecks?: Record<string, ItemPriceCheck>;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const patch = (ri: number, p: Partial<ItemRowForm>) => {
    onChange(items.map((r, i) => (i === ri ? { ...r, ...p } : r)));
  };

  // 合計は詳細画面と同じ数え方（lib/order-acceptance-totals）。
  const totals = acceptanceTotals(items);

  return (
    <Box>
      {items.map((row, ri) => {
        const check = row.itemId ? lineChecks?.[row.itemId] : undefined;
        return (
          <Box key={row.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group gap="xs" mb={4}>
              <Text c="dimmed" className="tabular-nums" size="xs">
                {tr("sales.orderAcceptanceItemsEditor.lineOrdinal", {
                  index: ri + 1,
                })}
              </Text>
              {!row.productId && (
                <Badge color="orange" size="xs" variant="light">
                  {tr("common.productNotIdentified")}
                </Badge>
              )}
              {check?.diff && (
                <Badge color="orange" size="xs" variant="light">
                  {tr("sales.orderAcceptanceDetail.priceMismatchExpected", {
                    expected: formatMoney(check.expected),
                  })}
                </Badge>
              )}
              {check?.unpriced && (
                <Badge color="gray" size="xs" variant="light">
                  {tr("common.noPriceList")}
                </Badge>
              )}
            </Group>
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <Box flex={1}>
                <Group
                  align="flex-end"
                  gap="sm"
                  grow
                  preventGrowOverflow={false}
                >
                  <SearchSelect
                    f4={productF4(tr)}
                    initialOption={
                      row.productId
                        ? {
                            value: row.productId,
                            label: row.productLabel ?? row.productText,
                          }
                        : null
                    }
                    label={tr("common.product")}
                    onChange={(v, opt) =>
                      patch(ri, {
                        productId: v,
                        productLabel: opt?.label ?? null,
                      })
                    }
                    onSearch={searchProductOptions}
                    placeholder={tr(
                      "sales.orderAcceptances.matchAgainstTheProductMaster",
                    )}
                    storageKey="product"
                    value={row.productId}
                  />
                  <TextInput
                    label={tr("sales.orderAcceptances.itemNameExtractedText")}
                    onChange={(e) =>
                      patch(ri, { productText: e.currentTarget.value })
                    }
                    placeholder={tr(
                      "sales.orderAcceptances.itemNameOnTheOrder",
                    )}
                    value={row.productText}
                  />
                  <Select
                    data={orderTypeOptions(locale)}
                    label={tr("common.type2")}
                    maw={130}
                    onChange={(v) =>
                      patch(ri, { orderType: (v ?? "PRODUCTION") as OrderType })
                    }
                    value={row.orderType}
                    withAsterisk
                  />
                  <NumberInput
                    label={tr("common.quantity")}
                    maw={100}
                    min={1}
                    onChange={(v) =>
                      patch(ri, { quantity: typeof v === "number" ? v : 0 })
                    }
                    value={row.quantity}
                    withAsterisk
                  />
                  <NumberInput
                    decimalScale={2}
                    label={tr("common.unitPrice")}
                    maw={150}
                    min={0}
                    onChange={(v) =>
                      patch(ri, { unitPrice: typeof v === "number" ? v : null })
                    }
                    placeholder={tr("sales.orderAcceptances.mayBeLeftBlank")}
                    prefix="¥"
                    thousandSeparator=","
                    value={row.unitPrice ?? ""}
                  />
                </Group>
                {/*
                  突合が 1 件に絞れなかったときの候補。製品が決まったら消える。
                  品名がずれているからこそ突合が外れているので、打ち直しはさせない。
                */}
                {!row.productId && (
                  <Box mt="xs">
                    <MatchSuggestions
                      onPick={(s) =>
                        patch(ri, { productId: s.id, productLabel: s.label })
                      }
                      suggestions={row.productSuggestions}
                    />
                  </Box>
                )}
              </Box>
              <ActionIcon
                aria-label={tr("common.removeLine")}
                color="red"
                disabled={items.length <= 1}
                mb={4}
                onClick={() => onChange(items.filter((_, i) => i !== ri))}
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            <Group align="flex-end" gap="sm" mt="xs">
              <DatePickerInput
                clearable
                label={tr("common.deliveryDate")}
                leftSection={<IconCalendar size={14} />}
                maw={200}
                onChange={(v) => patch(ri, { deliveryDate: v })}
                placeholder={tr("common.pickADate")}
                value={row.deliveryDate}
                valueFormat="YYYY/MM/DD"
              />
              <TextInput
                flex={1}
                label={tr("common.notes")}
                onChange={(e) => patch(ri, { notes: e.currentTarget.value })}
                placeholder={tr("common.lineNotesOptional")}
                value={row.notes}
              />
              <Text
                className="tabular-nums"
                ff="mono"
                fw={600}
                mb={8}
                size="sm"
                w={130}
              >
                {row.unitPrice != null
                  ? formatMoney(row.unitPrice * row.quantity)
                  : "—"}
              </Text>
            </Group>
          </Box>
        );
      })}

      <GhostButton
        leftSection={<IconPlus size={16} />}
        mt="md"
        onClick={() => onChange([...items, newItemRow()])}
        size="xs"
      >
        {tr("common.addLine")}
      </GhostButton>

      {/*
        合計（design.md §8.3 — 明細セクションの末尾）。入力しながら総額が
        見えないと、金額の桁違いに保存まで気づけない。単価未入力の行は
        足せないので、その件数を添える。
      */}
      <Divider mt="md" />
      <Group gap="md" justify="flex-end" mt="sm">
        <Text c="dimmed" size="xs">
          {tr("sales.orderAcceptanceItemsEditor.lineCountAndTotalQuantity", {
            count: totals.lineCount,
          })}{" "}
          <span className="tabular-nums">
            {totals.quantity.toLocaleString("ja-JP")}
          </span>
        </Text>
        {totals.unpricedCount > 0 && (
          <Badge color="orange" size="xs" variant="light">
            {tr("sales.orderAcceptanceDetail.excludingUnpricedCount", {
              count: totals.unpricedCount,
            })}
          </Badge>
        )}
        <Group gap="xs">
          <Text fw={600} size="sm">
            {tr("common.totalAmount")}
          </Text>
          <Text className="tabular-nums" ff="mono" fw={700} size="sm">
            {formatMoney(totals.amount)}
          </Text>
        </Group>
      </Group>
    </Box>
  );
}
