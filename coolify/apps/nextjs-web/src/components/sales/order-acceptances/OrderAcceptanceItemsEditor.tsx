"use client";

/**
 * OrderAcceptanceItemsEditor — 注文請書明細の行エディタ（SA04）。
 *
 * DRAFT 詳細のインライン編集と手入力（MANUAL）新規作成の両方で使う。
 * 各行: 製品 SearchSelect（未突合可 — 未選択は「製品未特定」バッジ）+
 * 品名テキスト（抽出の生テキスト）+ 種別 + 数量 + 単価 + 納期 + 備考 +
 * **配送**（出荷先・配送方法・エンドユーザー・担当拠点・出荷作業場所 — §8。
 * 1 通の注文書の中で行ごとに届け先が違う注文があるため、ヘッダではなく
 * 行ごとに持つ）。追加 / 削除可。バリデーションはサーバー側（actions.ts の
 * zod + 展開時の突合チェック）が最終ガード。
 *
 * **単価は既定で価格表が持つ**（§2 価格差異）。行に該当する価格表
 * （顧客 × 製品 × 注文種別 × 数量）があれば単価欄は読み取り専用で、価格表の
 * 単価が入る。外すときは行ごとの「単価を上書き」を明示的に入れる — 入力ミスと
 * 意図を同じ見た目にしないため（判定は lib/order-acceptance-price-core、
 * 解決は quotes/model の pure 関数で、保存時にサーバーが再解決する）。
 *
 * **配送は既定で畳んでいる** — 通常配送・届け先未指定のまま何十行も並ぶと
 * 5 欄がさらに 5 欄増えて読めなくなる。値が入っている行だけ開いた状態で
 * 出す（`hasDelivery` — lib/order-acceptance-readiness と同じ判定範囲）。
 * 届け先が 1 つだけの注文（大半）のために「先頭行を全行へ適用」を用意する
 * — ヘッダから欄が消えたぶんの入力補助で、保存先は持たない。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  searchEndUserOptions,
  searchProductItemOptions,
  searchRegrindItemOptions,
  searchShipToOptions,
} from "@/app/(dashboard)/_shared/option-search";
import type { OrderAcceptanceDraftInput } from "@/app/(dashboard)/sales/order-acceptances/actions";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { resolvePriceFromEntries } from "@/components/sales/quotes/model";
import { GhostButton } from "@/components/ui/buttons";
import { productItemF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  acceptanceDeliveryMethodOptions,
  orderTypeOptions,
} from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { formatMoney } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import {
  type AcceptancePriceState,
  acceptancePriceState,
  effectiveUnitPrice,
  normalizeOverride,
} from "@/lib/order-acceptance-price-core";
import {
  hasLineDelivery,
  shipToApplies,
} from "@/lib/order-acceptance-readiness";
import { acceptanceTotals } from "@/lib/order-acceptance-totals";
import { MatchSuggestions } from "./MatchSuggestions";
import type { MatchSuggestion, OrderAcceptanceItemView } from "./model";

const ORDER_TYPES = [
  "PRODUCTION",
  "TEST",
  "SAMPLE",
  "REGRIND",
  "OTHER",
] as const;
type OrderType = (typeof ORDER_TYPES)[number];

/** エディタ 1 行のフォーム値。 */
export interface ItemRowForm {
  rowId: string;
  /** 保存済み行の order_lines.id（未保存の追加行は null）。 */
  lineId: string | null;
  /** 突合済みの製品 — 値は品目 id（items.id）。null = 製品未特定。 */
  itemId: string | null;
  /** SearchSelect の初期表示用ラベル（突合済みのとき）。 */
  productLabel: string | null;
  productText: string;
  /** 未突合のときの候補（lib/product-match）。手で足した行は空。 */
  productSuggestions: MatchSuggestion[];
  orderType: OrderType;
  /**
   * 研ぎ直す工具（再研磨の行だけ）。**売り物とは別の欄** — 売るのは
   * 再研磨という役務（itemId）で、預かって数えるのはこの工具。
   */
  toolItemId: string | null;
  /** SearchSelect の初期表示用ラベル（値があるとき）。 */
  toolLabel: string | null;
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
  // ── 配送（§8）— 明細ごと。ヘッダには無い ──
  shipToBpId: string | null;
  /** SearchSelect の初期表示用ラベル（値があるとき）。 */
  shipToLabel: string | null;
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  endUserBpId: string | null;
  endUserLabel: string | null;
  assignedPlantId: string | null;
  shippingWorkLocationId: string | null;
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
  const resolution =
    ctx.customerBpId && row.itemId
      ? resolvePriceFromEntries(
          ctx.priceEntries,
          ctx.customerBpId,
          row.itemId,
          row.orderType,
          row.quantity,
          tr,
        )
      : null;
  const resolved = resolution?.ok ? resolution.price : null;
  const expected = resolved?.unitPrice ?? null;
  // 引けなかった理由 — 「価格表はあるが数量段階が無い」は差異と同じ扱いにする。
  const missReason = resolution && !resolution.ok ? resolution.reason : null;
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
      matched: Boolean(ctx.customerBpId && row.itemId),
      expected,
      actual: effective,
      overridden,
      missReason,
    }),
  };
}

let rowSeq = 0;
const newRowId = () => `item-${++rowSeq}-${Date.now()}`;

export const newItemRow = (): ItemRowForm => ({
  rowId: newRowId(),
  lineId: null,
  itemId: null,
  productLabel: null,
  productText: "",
  productSuggestions: [],
  orderType: "PRODUCTION",
  toolItemId: null,
  toolLabel: null,
  quantity: 1,
  unitPrice: null,
  priceOverridden: false,
  deliveryDate: null,
  notes: "",
  shipToBpId: null,
  shipToLabel: null,
  deliveryMethod: "NORMAL",
  endUserBpId: null,
  endUserLabel: null,
  assignedPlantId: null,
  shippingWorkLocationId: null,
});

/** サーバー view → エディタ行。 */
export function toItemRows(items: OrderAcceptanceItemView[]): ItemRowForm[] {
  return items.map((it) => ({
    rowId: newRowId(),
    lineId: it.id,
    itemId: it.itemId,
    productLabel: it.productLabel,
    productText: it.productText ?? "",
    productSuggestions: it.productSuggestions,
    orderType: (ORDER_TYPES as readonly string[]).includes(it.orderType)
      ? (it.orderType as OrderType)
      : "PRODUCTION",
    toolItemId: it.toolItemId,
    toolLabel: it.toolLabel,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    priceOverridden: it.priceOverridden,
    deliveryDate: it.deliveryDate,
    notes: it.notes ?? "",
    shipToBpId: it.shipToBpId,
    shipToLabel: it.shipToName,
    deliveryMethod: it.deliveryMethod,
    endUserBpId: it.endUserBpId,
    endUserLabel: it.endUserName,
    assignedPlantId: it.assignedPlantId,
    shippingWorkLocationId: it.shippingWorkLocationId,
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
      itemId: r.itemId,
      productText: r.productText || null,
      orderType: r.orderType,
      toolItemId: r.toolItemId,
      quantity: r.quantity,
      unitPrice: price.effective,
      priceOverridden: price.state === "override",
      deliveryDate: r.deliveryDate,
      notes: r.notes || null,
      // 配送（§8）— サーバーも normalizeShipToBpId / lineRefsError を通すが、
      // 画面の入力は信用しないという同じ約束（order-acceptance-readiness.ts）。
      shipToBpId: r.shipToBpId,
      deliveryMethod: r.deliveryMethod,
      endUserBpId: r.endUserBpId,
      assignedPlantId: r.assignedPlantId ? Number(r.assignedPlantId) : null,
      shippingWorkLocationId: r.shippingWorkLocationId
        ? Number(r.shippingWorkLocationId)
        : null,
    };
  });
}

export function OrderAcceptanceItemsEditor({
  items,
  onChange,
  priceContext,
  plantOptions,
  workLocationOptions,
}: {
  items: ItemRowForm[];
  onChange: (items: ItemRowForm[]) => void;
  /** 価格表を引くための顧客 + エントリ。 */
  priceContext: ItemPriceContext;
  /** 担当拠点の選択肢（配送節。有効のみ）。 */
  plantOptions: { value: string; label: string }[];
  /** 出荷作業場所の選択肢（配送節。グループ / 場所）。 */
  workLocationOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const patch = (ri: number, p: Partial<ItemRowForm>) => {
    onChange(items.map((r, i) => (i === ri ? { ...r, ...p } : r)));
  };
  // 配送節（§8）の開閉。値が入っている行は既定で開く（hasLineDelivery）。
  // 人がトグルを押した行はその向きを**そのまま**覚える（true / false）—
  // 「既定から反転」で持つと、空の節を開いて最初の値を入れた瞬間に既定側が
  // 変わって節が閉じてしまう（実機で起きた）。押していない行は既定に従う。
  const [deliveryOpenByRow, setDeliveryOpenByRow] = useState<
    Map<string, boolean>
  >(new Map());
  const isDeliveryOpen = (row: ItemRowForm) =>
    deliveryOpenByRow.get(row.rowId) ?? hasLineDelivery(row);
  const toggleDelivery = (rowId: string) => {
    const row = items.find((r) => r.rowId === rowId);
    const open = row ? isDeliveryOpen(row) : false;
    setDeliveryOpenByRow((prev) => new Map(prev).set(rowId, !open));
  };

  // 先頭行の配送を全行へ撒く — 届け先が 1 つだけの注文（大半）のための
  // 入力補助。保存先は持たない（押した瞬間に他の行の値を上書きするだけ）。
  const applyDeliveryToAll = () => {
    if (items.length < 2) return;
    const first = items[0];
    onChange(
      items.map((r, i) =>
        i === 0
          ? r
          : {
              ...r,
              shipToBpId: first.shipToBpId,
              shipToLabel: first.shipToLabel,
              deliveryMethod: first.deliveryMethod,
              endUserBpId: first.endUserBpId,
              endUserLabel: first.endUserLabel,
              assignedPlantId: first.assignedPlantId,
              shippingWorkLocationId: first.shippingWorkLocationId,
            },
      ),
    );
    setDeliveryOpenByRow(new Map());
  };

  const prices = items.map((row) => rowPrice(row, priceContext, tr));

  // 合計は詳細画面と同じ数え方（lib/order-acceptance-totals）。単価は
  // 価格表 / 上書きの解決後の値で数える（画面に出ている金額と一致させる）。
  const totals = acceptanceTotals(
    items.map((row, i) => ({
      itemId: row.itemId,
      quantity: row.quantity,
      unitPrice: prices[i].effective,
    })),
  );

  return (
    <Box>
      {/*
        届け先が 1 つだけの注文（大半）向けの入力補助。ヘッダから配送欄が
        消えたぶん、2 行目以降を 1 つずつ埋めさせないため。保存先は持たない。
      */}
      {items.length > 1 && (
        <Group justify="flex-end" mb="sm">
          <GhostButton
            leftSection={<IconTruckDelivery size={14} />}
            onClick={applyDeliveryToAll}
            size="xs"
          >
            {tr("sales.orderAcceptanceItemsEditor.applyLineOneDeliveryToAll")}
          </GhostButton>
        </Group>
      )}
      {items.map((row, ri) => {
        const price = prices[ri];
        // 再研磨の行は「売る役務」と「預かる工具」の 2 つを指す。
        const isRegrind = row.orderType === "REGRIND";
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
              {!row.itemId && (
                <Badge color="orange" size="xs" variant="light">
                  {tr("common.productNotIdentified")}
                </Badge>
              )}
              {price.state === "unpriced" && (
                <Badge color="gray" size="xs" variant="light">
                  {tr("common.noPriceList")}
                </Badge>
              )}
              {price.state === "noTier" && (
                <Badge color="orange" size="xs" variant="light">
                  {tr("common.noPriceListTier")}
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
                  {/*
                    売り物の欄。再研磨の行が指すのは**再研磨の品目**（役務）で、
                    値段はそこに付く — 研ぎ直す工具は下の別の欄で選ぶ。
                  */}
                  <SearchSelect
                    f4={isRegrind ? undefined : productItemF4(tr)}
                    initialOption={
                      row.itemId
                        ? {
                            value: row.itemId,
                            label: row.productLabel ?? row.productText,
                          }
                        : null
                    }
                    label={
                      isRegrind
                        ? tr("sales.orderAcceptanceItemsEditor.regrindItem")
                        : tr("common.product")
                    }
                    onChange={(v, opt) =>
                      patch(ri, {
                        itemId: v,
                        productLabel: opt?.label ?? null,
                      })
                    }
                    onSearch={
                      isRegrind
                        ? searchRegrindItemOptions
                        : searchProductItemOptions
                    }
                    placeholder={
                      isRegrind
                        ? tr(
                            "sales.orderAcceptanceItemsEditor.searchTheRegrindItems",
                          )
                        : tr(
                            "sales.orderAcceptances.matchAgainstTheProductMaster",
                          )
                    }
                    storageKey={
                      isRegrind
                        ? "order-line-regrind-item"
                        : "order-line-product-item"
                    }
                    value={row.itemId}
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
                    onChange={(v) => {
                      const next = (v ?? "PRODUCTION") as OrderType;
                      // 再研磨とそれ以外では**品目の種類そのものが違う**
                      // （再研磨の役務 / 製品）。跨いだら選び直し — 残すと
                      // 保存側の検査で必ず弾かれる行になる。
                      const crosses =
                        (next === "REGRIND") !== (row.orderType === "REGRIND");
                      patch(ri, {
                        orderType: next,
                        ...(crosses
                          ? { itemId: null, productLabel: null }
                          : {}),
                        ...(next === "REGRIND"
                          ? {}
                          : { toolItemId: null, toolLabel: null }),
                      });
                    }}
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
                {!row.itemId && !isRegrind && (
                  <Box mt="xs">
                    <MatchSuggestions
                      onPick={(s) =>
                        patch(ri, { itemId: s.id, productLabel: s.label })
                      }
                      suggestions={row.productSuggestions}
                    />
                  </Box>
                )}
                {/*
                  研ぎ直す工具。自社の製品でも他社製品でもよい（他社の工具を
                  預かるのが再研磨の大半なので、他社製品を出す唯一の欄）。
                  確定済みの再研磨明細では必須 — 工具が決まらないと預り品を
                  数えられず、指示書も作れない。
                */}
                {isRegrind && (
                  <Box mt="xs">
                    <SearchSelect
                      initialOption={
                        row.toolItemId
                          ? {
                              value: row.toolItemId,
                              label: row.toolLabel ?? row.toolItemId,
                            }
                          : null
                      }
                      label={tr(
                        "sales.orderAcceptanceItemsEditor.toolToRegrind",
                      )}
                      onChange={(v, opt) =>
                        patch(ri, {
                          toolItemId: v,
                          toolLabel: opt?.label ?? null,
                        })
                      }
                      onSearch={(q) =>
                        searchProductItemOptions(q, { includeExternal: true })
                      }
                      placeholder={tr(
                        "sales.orderAcceptanceItemsEditor.searchTheToolBeingHeld",
                      )}
                      storageKey="order-line-tool-item"
                      value={row.toolItemId}
                      withAsterisk
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
            {/*
              配送（§8）— 既定は畳む。値が入っている行は開いた状態で出す
              （hasLineDelivery）。届け先が無い大半の行を、5 欄ぶん常時
              表示させないための折りたたみ。
            */}
            <GhostButton
              leftSection={
                isDeliveryOpen(row) ? (
                  <IconChevronUp size={14} />
                ) : (
                  <IconChevronDown size={14} />
                )
              }
              mt="xs"
              onClick={() => toggleDelivery(row.rowId)}
              size="xs"
            >
              {tr("sales.orderAcceptanceItemsEditor.delivery")}
              {!isDeliveryOpen(row) && hasLineDelivery(row) && (
                <Badge color="blue" ml={6} size="xs" variant="light">
                  {row.deliveryMethod === "DIRECT_TO_USER"
                    ? (row.endUserLabel ??
                      tr(
                        "sales.orderAcceptanceReadiness.lineEndUserNotIdentified",
                        {
                          rows: ri + 1,
                        },
                      ))
                    : (row.shipToLabel ?? tr("sales.orderAcceptances.shipTo"))}
                </Badge>
              )}
            </GhostButton>
            <Collapse expanded={isDeliveryOpen(row)}>
              <SimpleGrid cols={{ base: 1, sm: 3 }} mt="xs" spacing="sm">
                {/* 出荷先は通常配送だけの欄 — 直送では落とす（画面も灰色に
                    するが、保存側 normalizeShipToBpId でも必ず落とす）。 */}
                <SearchSelect
                  clearable
                  description={
                    shipToApplies(row.deliveryMethod)
                      ? undefined
                      : tr("sales.orderAcceptances.shipToOnlyForNormalDelivery")
                  }
                  disabled={!shipToApplies(row.deliveryMethod)}
                  initialOption={
                    row.shipToBpId
                      ? {
                          value: row.shipToBpId,
                          label: row.shipToLabel ?? row.shipToBpId,
                        }
                      : null
                  }
                  label={
                    <HelpLabel
                      {...fieldHelp(tr, "orderAcceptance", "shipTo")}
                    />
                  }
                  onChange={(v, opt) =>
                    patch(ri, {
                      shipToBpId: v,
                      shipToLabel: opt?.label ?? null,
                    })
                  }
                  onSearch={searchShipToOptions}
                  placeholder={tr("common.searchShipToOptional")}
                  storageKey="ship-to"
                  value={row.shipToBpId}
                />
                <Select
                  allowDeselect={false}
                  data={acceptanceDeliveryMethodOptions(locale)}
                  label={
                    <HelpLabel
                      {...fieldHelp(tr, "orderAcceptance", "deliveryMethod")}
                    />
                  }
                  onChange={(v) => {
                    const next = (v as "NORMAL" | "DIRECT_TO_USER") ?? "NORMAL";
                    // 直送に切り替えたら出荷先は捨てる（欄が灰色のまま値だけ
                    // 残ると、画面に出ていない届け先を持った行になる）。
                    patch(ri, {
                      deliveryMethod: next,
                      shipToBpId: shipToApplies(next) ? row.shipToBpId : null,
                      shipToLabel: shipToApplies(next) ? row.shipToLabel : null,
                    });
                  }}
                  value={row.deliveryMethod}
                  withAsterisk
                />
                <SearchSelect
                  clearable
                  initialOption={
                    row.endUserBpId
                      ? {
                          value: row.endUserBpId,
                          label: row.endUserLabel ?? row.endUserBpId,
                        }
                      : null
                  }
                  label={
                    <HelpLabel
                      {...fieldHelp(tr, "orderAcceptance", "endUser")}
                    />
                  }
                  onChange={(v, opt) =>
                    patch(ri, {
                      endUserBpId: v,
                      endUserLabel: opt?.label ?? null,
                    })
                  }
                  onSearch={searchEndUserOptions}
                  placeholder={
                    row.deliveryMethod === "DIRECT_TO_USER"
                      ? tr("common.searchEndUsers")
                      : tr("common.searchEndUsersOptional")
                  }
                  storageKey="end-user"
                  value={row.endUserBpId}
                  withAsterisk={row.deliveryMethod === "DIRECT_TO_USER"}
                />
                <Select
                  clearable
                  data={plantOptions}
                  label={
                    <HelpLabel
                      {...fieldHelp(tr, "orderAcceptance", "assignedPlant")}
                    />
                  }
                  onChange={(v) => patch(ri, { assignedPlantId: v })}
                  placeholder={tr("common.selectASiteOptional")}
                  searchable
                  value={row.assignedPlantId}
                />
                <Select
                  clearable
                  data={workLocationOptions}
                  label={
                    <HelpLabel
                      {...fieldHelp(
                        tr,
                        "orderAcceptance",
                        "shippingWorkLocation",
                      )}
                    />
                  }
                  onChange={(v) => patch(ri, { shippingWorkLocationId: v })}
                  placeholder={tr("common.selectAWorkLocationOptional")}
                  searchable
                  value={row.shippingWorkLocationId}
                />
              </SimpleGrid>
            </Collapse>
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
