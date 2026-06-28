"use client";

/**
 * ProductPriceResolverInput — 製品×注文種別×数量 → 価格表単価の自動解決 (design.md §12.9).
 *
 * One quote line: choosing 製品 / 注文種別 / 数量 auto-fills 単価 from the 価格表
 * (price_list_tiers) for the row's 顧客. The 単価 stays editable — a manual edit
 * marks the line as 手動 (priceTierId = null). 金額 = 単価 × 数量.
 */

import { Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { useIsMobile } from "@/hooks/useViewport";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_OPTIONS, PRODUCTS } from "@/lib/mock";
import { resolveUnitPrice } from "./quotes/mock";

/** The editable slice of a quote line this control owns. */
export interface ResolverValue {
  productId: string;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number;
  priceTierId: string | null;
}

const productName = (id: string) =>
  PRODUCTS.find((p) => p.value === id)?.label ?? id;

export function ProductPriceResolverInput({
  customerId,
  value,
  onChange,
}: {
  customerId: string;
  value: ResolverValue;
  onChange: (next: ResolverValue) => void;
}) {
  const isMobile = useIsMobile();

  /** Re-resolve 単価 from the 価格表 when a key field (製品/種別/数量) changes. */
  const reresolve = (patch: Partial<ResolverValue>): ResolverValue => {
    const next = { ...value, ...patch };
    next.productName = productName(next.productId);
    const resolved =
      customerId && next.productId
        ? resolveUnitPrice(
            customerId,
            next.productId,
            next.orderType,
            next.quantity,
          )
        : null;
    next.unitPrice = resolved?.unitPrice ?? 0;
    next.priceTierId = resolved?.tierId ?? null;
    return next;
  };

  const amount = value.unitPrice * value.quantity;

  return (
    <Group align="flex-end" gap="sm" wrap={isMobile ? "wrap" : "nowrap"}>
      <Select
        data={PRODUCTS}
        flex={isMobile ? "1 1 100%" : 2}
        label="製品"
        onChange={(v) => onChange(reresolve({ productId: v ?? "" }))}
        placeholder="製品を選択"
        searchable
        value={value.productId || null}
        withAsterisk
      />
      <Select
        data={ORDER_TYPE_OPTIONS}
        flex={isMobile ? 1 : 1}
        label="注文種別"
        onChange={(v) => onChange(reresolve({ orderType: v ?? "PRODUCTION" }))}
        value={value.orderType}
      />
      <NumberInput
        flex={isMobile ? 1 : 1}
        label="数量"
        min={1}
        onChange={(v) =>
          onChange(reresolve({ quantity: typeof v === "number" ? v : 0 }))
        }
        value={value.quantity}
      />
      <NumberInput
        decimalScale={2}
        description={value.priceTierId ? "価格表" : "手動"}
        flex={isMobile ? 1 : 1.2}
        label="単価"
        min={0}
        onChange={(v) =>
          onChange({
            ...value,
            unitPrice: typeof v === "number" ? v : 0,
            priceTierId: null, // 手動上書き
          })
        }
        prefix="¥"
        thousandSeparator=","
        value={value.unitPrice}
      />
      <Stack
        align={isMobile ? "flex-start" : "flex-end"}
        flex={isMobile ? "1 1 100%" : 1.2}
        gap={2}
      >
        <Text c="dimmed" size="xs">
          金額
        </Text>
        <Text className="tabular-nums" ff="mono" fw={600} size="sm">
          {formatMoney(amount)}
        </Text>
      </Stack>
    </Group>
  );
}
