"use client";

/**
 * OrderAcceptanceItemsEditor — 注文請書明細の行エディタ（SA04）。
 *
 * DRAFT 詳細のインライン編集と手入力（MANUAL）新規作成の両方で使う。
 * 各行: 製品 SearchSelect（未突合可 — 未選択は「製品未特定」バッジ）+
 * 品名テキスト（抽出の生テキスト）+ 種別 + 数量 + 単価 + 納期 + 備考。
 * 追加 / 削除可。バリデーションはサーバー側（actions.ts の zod + 展開時の
 * 突合チェック）が最終ガード。
 *
 * **単価は既定で価格表が持つ**（§2 価格差異）。行に該当する価格表
 * （顧客 × 製品 × 注文種別 × 数量）があれば単価欄は読み取り専用で、価格表の
 * 単価が入る。外すときは行ごとの「単価を上書き」を明示的に入れる — 入力ミスと
 * 意図を同じ見た目にしないため（判定は lib/order-acceptance-price-core、
 * 解決は quotes/model の pure 関数で、保存時にサーバーが再解決する）。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import type { OrderAcceptanceDraftInput } from "@/app/(dashboard)/sales/order-acceptances/actions";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { resolveUnitPriceFromEntries } from "@/components/sales/quotes/model";
import { GhostButton } from "@/components/ui/buttons";
import { productF4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { orderTypeOptions } from "@/lib/enum-labels";
import { formatMoney } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import {
  type AcceptancePriceState,
  acceptancePriceState,
  effectiveUnitPrice,
  normalizeOverride,
} from "@/lib/order-acceptance-price-core";
import { acceptanceTotals } from "@/lib/order-acceptance-totals";
import { MatchSuggestions } from "./MatchSuggestions";
import type { MatchSuggestion, OrderAcceptanceItemView } from "./model";

const ORDER_TYPES = ["PRODUCTION", "TEST", "SAMPLE", "OTHER"] as const;
type OrderType = (typeof ORDER_TYPES)[number];

/** エディタ 1 行のフォーム値。 */
export interface ItemRowForm {
  rowId: string;
  /** 保存済み行の order_lines.id（未保存の追加行は null）。 */
  itemId: string | null;
  productId: string | null;
  /** SearchSelect の初期表示用ラベル（突合済みのとき）。 */
  productLabel: string | null;
  productText: string;
  /** 未突合のときの候補（lib/product-match）。手で足した行は空。 */
  productSuggestions: MatchSuggestion[];
  orderType: OrderType;
  quantity: number;
  /**
   * 人が入れた単価。**価格表どおりの行では使われない**（表示も保存も
   * 価格表の単価 — rowPrice を通す）。上書き中 / 価格表なしの行の値。
   */
  unitPrice: number | null;
  /** 「単価を上書き」が入っているか。 */
  priceOverridden: boolean;
  deliveryDate: string | null;
  notes: string;
}

/**
 * 価格表を引くための文脈。顧客は編集中に変わりうるので、エントリは
 * 顧客が決まるたびに取り直したものを渡す（price-lookup.ts）。
 */
export interface ItemPriceContext {
  customerBpId: string | null;
  priceEntries: PriceListEntry[];
}

/** 1 行の単価の出どころ（表示・合計・payload が同じ値を見る）。 */
export interface RowPrice {
  /** 価格表から解決した単価（null = 引けない）。 */
  expected: number | null;
  /** 効いている数量段階のラベル（「1〜9本」）。 */
  tierLabel: string | null;
  /** 単価を価格表が持っている行か（= 単価欄は読み取り専用）。 */
  locked: boolean;
  /** 上書きを入れられる行か（価格表がある行だけ）。 */
  overridable: boolean;
  /** 実際に保存・集計する単価。 */
  effective: number | null;
  state: AcceptancePriceState;
}

/**
 * 行の単価を解決する。**表示と payload の両方がこれを通る** — 「見えている
 * 単価」と「保存される単価」がずれないようにするため。
 */
export function rowPrice(
  row: ItemRowForm,
  ctx: ItemPriceContext,
  tr: Tr,
): RowPrice {
  const resolved =
    ctx.customerBpId && row.productId
      ? resolveUnitPriceFromEntries(
          ctx.priceEntries,
          ctx.customerBpId,
          row.productId,
          row.orderType,
          row.quantity,
          tr,
        )
      : null;
  const expected = resolved?.unitPrice ?? null;
  const overridden = normalizeOverride({
    expected,
    overridden: row.priceOverridden,
  });
  const effective = effectiveUnitPrice({
    expected,
    entered: row.unitPrice,
    overridden,
  });
  return {
    expected,
    tierLabel: resolved?.tierLabel ?? null,
    locked: expected != null && !overridden,
    overridable: expected != null,
    effective,
    state: acceptancePriceState({
      matched: Boolean(ctx.customerBpId && row.productId),
      expected,
      actual: effective,
      overridden,
    }),
  };
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
  priceOverridden: false,
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
    priceOverridden: it.priceOverridden,
    deliveryDate: it.deliveryDate,
    notes: it.notes ?? "",
  }));
}

/**
 * エディタ行 → Server Action 入力。
 *
 * 価格表どおりの行は解決した単価を載せる（サーバーも保存時に同じ解決を
 * 行うので、ここは「画面に見えていた金額」を送るためのもの）。
 */
export function toItemPayload(
  rows: ItemRowForm[],
  ctx: ItemPriceContext,
  tr: Tr,
): OrderAcceptanceDraftInput["items"] {
  return rows.map((r) => {
    const price = rowPrice(r, ctx, tr);
    return {
      productId: r.productId,
      productText: r.productText || null,
      orderType: r.orderType,
      quantity: r.quantity,
      unitPrice: price.effective,
      priceOverridden: price.state === "override",
      deliveryDate: r.deliveryDate,
      notes: r.notes || null,
    };
  });
}

export function OrderAcceptanceItemsEditor({
  items,
  onChange,
  priceContext,
}: {
  items: ItemRowForm[];
  onChange: (items: ItemRowForm[]) => void;
  /** 価格表を引くための顧客 + エントリ。 */
  priceContext: ItemPriceContext;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const patch = (ri: number, p: Partial<ItemRowForm>) => {
    onChange(items.map((r, i) => (i === ri ? { ...r, ...p } : r)));
  };

  const prices = items.map((row) => rowPrice(row, priceContext, tr));

  // 合計は詳細画面と同じ数え方（lib/order-acceptance-totals）。単価は
  // 価格表 / 上書きの解決後の値で数える（画面に出ている金額と一致させる）。
  const totals = acceptanceTotals(
    items.map((row, i) => ({
      productId: row.productId,
      quantity: row.quantity,
      unitPrice: prices[i].effective,
    })),
  );

  return (
    <Box>
      {items.map((row, ri) => {
        const price = prices[ri];
        // 価格表どおりに戻す行で、いま入っている単価が違う場合 —
        // 保存すると価格表の単価に置き換わるので、置き換わる前に見せる。
        const replaced =
          price.locked &&
          row.unitPrice != null &&
          row.unitPrice !== price.expected
            ? row.unitPrice
            : null;
        return (
          <Box key={row.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group gap="xs" mb={4} wrap="wrap">
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
              {price.state === "unpriced" && (
                <Badge color="gray" size="xs" variant="light">
                  {tr("common.noPriceList")}
                </Badge>
              )}
              {price.locked && (
                <Badge color="blue" size="xs" variant="light">
                  {price.tierLabel
                    ? tr(
                        "sales.orderAcceptanceItemsEditor.priceListPriceWithTier",
                        {
                          price: formatMoney(price.expected),
                          tier: price.tierLabel,
                        },
                      )
                    : tr("sales.orderAcceptanceItemsEditor.priceListPrice", {
                        price: formatMoney(price.expected),
                      })}
                </Badge>
              )}
              {replaced != null && (
                <Badge color="orange" size="xs" variant="light">
                  {tr("sales.orderAcceptanceItemsEditor.willReplaceWithList", {
                    entered: formatMoney(replaced),
                  })}
                </Badge>
              )}
              {price.state === "override" &&
                price.effective !== price.expected && (
                  <Badge color="violet" size="xs" variant="light">
                    {tr("sales.orderAcceptanceItemsEditor.overriddenFromList", {
                      expected: formatMoney(price.expected),
                    })}
                  </Badge>
                )}
              {/*
                上書きは価格表がある行だけの選択肢 — 引ける単価が無い行に
                「上書き」を出すと、外す相手のいない印が残る。
              */}
              {price.overridable && (
                <Switch
                  checked={row.priceOverridden}
                  label={tr("sales.orderAcceptanceItemsEditor.overridePrice")}
                  ml="auto"
                  onChange={(e) =>
                    patch(ri, {
                      priceOverridden: e.currentTarget.checked,
                      // 上書きを入れた瞬間の初期値は「いま見えている単価」。
                      // 空欄から打ち直させない（直したいのは端数だけのことが多い）。
                      unitPrice: e.currentTarget.checked
                        ? (row.unitPrice ?? price.expected)
                        : row.unitPrice,
                    })
                  }
                  size="xs"
                />
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
                  {/*
                    価格表どおりの行は読み取り専用。値は価格表から導出している
                    ので、上書きを外すだけで元の単価に戻る（打ち直し不要）。
                  */}
                  <NumberInput
                    decimalScale={2}
                    label={tr("common.unitPrice")}
                    maw={150}
                    min={0}
                    onChange={(v) =>
                      patch(ri, { unitPrice: typeof v === "number" ? v : null })
                    }
                    placeholder={
                      price.locked
                        ? tr("sales.orderAcceptanceItemsEditor.fromPriceList")
                        : tr("sales.orderAcceptances.mayBeLeftBlank")
                    }
                    prefix="¥"
                    readOnly={price.locked}
                    thousandSeparator=","
                    value={price.effective ?? ""}
                    variant={price.locked ? "filled" : "default"}
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
                {price.effective != null
                  ? formatMoney(price.effective * row.quantity)
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
