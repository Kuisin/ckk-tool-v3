"use client";

/**
 * OrderAcceptanceItemsEditor — 受注請書明細の行エディタ（SA03）。
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
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import type { OrderAcceptanceDraftInput } from "@/app/(dashboard)/sales/order-acceptances/actions";
import { GhostButton } from "@/components/ui/buttons";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { ORDER_TYPE_OPTIONS } from "@/lib/enum-labels";
import { formatMoney } from "@/lib/format";
import type { OrderAcceptanceItemView } from "./model";

const ORDER_TYPES = ["PRODUCTION", "TEST", "SAMPLE", "OTHER"] as const;
type OrderType = (typeof ORDER_TYPES)[number];

/** エディタ 1 行のフォーム値。 */
export interface ItemRowForm {
  rowId: string;
  productId: string | null;
  /** SearchSelect の初期表示用ラベル（突合済みのとき）。 */
  productLabel: string | null;
  productText: string;
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
  productId: null,
  productLabel: null,
  productText: "",
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
    productId: it.productId,
    productLabel: it.productLabel,
    productText: it.productText ?? "",
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
}: {
  items: ItemRowForm[];
  onChange: (items: ItemRowForm[]) => void;
}) {
  const patch = (ri: number, p: Partial<ItemRowForm>) => {
    onChange(items.map((r, i) => (i === ri ? { ...r, ...p } : r)));
  };

  return (
    <Box>
      {items.map((row, ri) => (
        <Box key={row.rowId}>
          {ri > 0 && <Divider my="md" />}
          <Group gap="xs" mb={4}>
            <Text c="dimmed" className="tabular-nums" size="xs">
              明細 {ri + 1}
            </Text>
            {!row.productId && (
              <Badge color="orange" size="xs" variant="light">
                製品未特定
              </Badge>
            )}
          </Group>
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <Box flex={1}>
              <Group align="flex-end" gap="sm" grow preventGrowOverflow={false}>
                <SearchSelect
                  f4={PRODUCT_F4}
                  initialOption={
                    row.productId
                      ? {
                          value: row.productId,
                          label: row.productLabel ?? row.productText,
                        }
                      : null
                  }
                  label="製品"
                  onChange={(v, opt) =>
                    patch(ri, {
                      productId: v,
                      productLabel: opt?.label ?? null,
                    })
                  }
                  onSearch={searchProductOptions}
                  placeholder="製品マスタと突合"
                  storageKey="product"
                  value={row.productId}
                />
                <TextInput
                  label="品名（抽出テキスト）"
                  onChange={(e) =>
                    patch(ri, { productText: e.currentTarget.value })
                  }
                  placeholder="注文書の品名"
                  value={row.productText}
                />
                <Select
                  data={ORDER_TYPE_OPTIONS}
                  label="種別"
                  maw={130}
                  onChange={(v) =>
                    patch(ri, { orderType: (v ?? "PRODUCTION") as OrderType })
                  }
                  value={row.orderType}
                  withAsterisk
                />
                <NumberInput
                  label="数量"
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
                  label="単価"
                  maw={150}
                  min={0}
                  onChange={(v) =>
                    patch(ri, { unitPrice: typeof v === "number" ? v : null })
                  }
                  placeholder="未入力可"
                  prefix="¥"
                  thousandSeparator=","
                  value={row.unitPrice ?? ""}
                />
              </Group>
            </Box>
            <ActionIcon
              aria-label="明細を削除"
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
              label="納期"
              leftSection={<IconCalendar size={14} />}
              maw={200}
              onChange={(v) => patch(ri, { deliveryDate: v })}
              placeholder="日付を選択"
              value={row.deliveryDate}
              valueFormat="YYYY/MM/DD"
            />
            <TextInput
              flex={1}
              label="備考"
              onChange={(e) => patch(ri, { notes: e.currentTarget.value })}
              placeholder="行の備考（任意）"
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
      ))}

      <GhostButton
        leftSection={<IconPlus size={16} />}
        mt="md"
        onClick={() => onChange([...items, newItemRow()])}
        size="xs"
      >
        明細を追加
      </GhostButton>
    </Box>
  );
}
