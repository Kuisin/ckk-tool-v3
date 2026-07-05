"use client";

/**
 * ProductPriceResolverInput — 製品×注文種別×数量 → 価格表からの完全自動解決
 * (design.md §12.9).
 *
 * 見積書は印刷用ドキュメント — 価格は価格表からのみ解決する。製品 / 注文種別 /
 * 数量 を選ぶと、単価（基準単価 × 数量倍率）と値引き（値引きルール）が自動計算
 * される。手動の単価・値引き入力はない。該当する価格表がない行は見積できない
 * （試算 → 価格表登録が必要）。金額 = 単価 × 数量 − 値引き。
 */

import { Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { useIsMobile } from "@/hooks/useViewport";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_OPTIONS } from "@/lib/mock";
import type { PriceListEntry } from "./price-lists/model";
import { resolveUnitPriceFromEntries } from "./quotes/model";

/** The slice of a quote line this control owns — 価格は全て自動解決値. */
export interface ResolverValue {
  productId: string;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number;
  priceTierId: string | null;
  /** 値引きルールから自動計算された明細値引き額. */
  discountAmount: number;
  /** 適用された値引きルール名（なければ null）. */
  discountLabel: string | null;
}

export function ProductPriceResolverInput({
  customerId,
  entries,
  productOptions,
  value,
  onChange,
}: {
  customerId: string;
  /** 顧客の価格表エントリ（サーバー取得）— ライブ解決に使用。 */
  entries: PriceListEntry[];
  productOptions: Option[];
  value: ResolverValue;
  onChange: (next: ResolverValue) => void;
}) {
  const isMobile = useIsMobile();

  const productName = (id: string) =>
    productOptions.find((p) => p.value === id)?.label ?? id;

  /** Re-resolve 単価・値引き from the 価格表 when 製品/種別/数量 changes. */
  const reresolve = (patch: Partial<ResolverValue>): ResolverValue => {
    const next = { ...value, ...patch };
    next.productName = productName(next.productId);
    const resolved =
      customerId && next.productId
        ? resolveUnitPriceFromEntries(
            entries,
            customerId,
            next.productId,
            next.orderType,
            next.quantity,
          )
        : null;
    next.unitPrice = resolved?.unitPrice ?? 0;
    next.priceTierId = resolved?.tierId ?? null;
    next.discountAmount = resolved?.discountAmount ?? 0;
    next.discountLabel = resolved?.discountLabel ?? null;
    return next;
  };

  const amount = Math.max(
    0,
    value.unitPrice * value.quantity - value.discountAmount,
  );
  const unresolved = Boolean(value.productId) && value.priceTierId == null;

  return (
    <Group align="flex-end" gap="sm" wrap={isMobile ? "wrap" : "nowrap"}>
      <Select
        data={productOptions}
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
      <Stack
        align={isMobile ? "flex-start" : "flex-end"}
        flex={isMobile ? 1 : 1.1}
        gap={2}
      >
        <Text c="dimmed" size="xs">
          <HelpLabel
            help="顧客×製品×注文種別×数量の価格表から自動解決（基準単価 × 数量倍率、行の手動上書きがあればそれ）。"
            label="単価（価格表）"
          />
        </Text>
        {unresolved ? (
          <Text c="orange" fw={600} size="xs">
            価格表なし
          </Text>
        ) : (
          <Text className="tabular-nums" ff="mono" size="sm">
            {formatMoney(value.unitPrice)}
          </Text>
        )}
      </Stack>
      <Stack
        align={isMobile ? "flex-start" : "flex-end"}
        flex={isMobile ? 1 : 1.1}
        gap={2}
      >
        <Text c="dimmed" size="xs">
          <HelpLabel
            help="価格表の値引きルール（期間・数量条件）から自動適用。複数該当時は値引き額が最大のルール。"
            label="値引き（自動）"
          />
        </Text>
        {value.discountAmount > 0 ? (
          <div>
            <Text
              c="red"
              className="tabular-nums"
              ff="mono"
              size="sm"
              ta="right"
            >
              -{formatMoney(value.discountAmount)}
            </Text>
            {value.discountLabel && (
              <Text c="dimmed" size="xs" ta="right">
                {value.discountLabel}
              </Text>
            )}
          </div>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        )}
      </Stack>
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
