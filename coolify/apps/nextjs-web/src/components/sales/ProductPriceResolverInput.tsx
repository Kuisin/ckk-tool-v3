"use client";

/**
 * ProductPriceResolverInput — 製品×注文種別×数量 → 価格表からの完全自動解決
 * (design.md §12.9).
 *
 * 見積書は印刷用ドキュメント — 価格は価格表からのみ解決する。製品 / 注文種別 /
 * 数量 を選ぶと、単価（基準単価 × 数量倍率）と値引き（値引きルール）が自動計算
 * される。手動の単価・値引き入力はない。該当する価格表がない行は見積できない
 * （価格試算 → 価格表登録が必要）。金額 = 単価 × 数量 − 値引き。
 *
 * 再研磨の行は売り物（再研磨品目）とは別に**研ぎ直す工具**を持つ。価格表は
 * 工具一致 → 工具なし → 標準価格 の順で引く（注文請書の明細と同じ 1 本の解決 —
 * quotes/model `resolvePriceFromEntries`）。工具ごとの価格表が当たったときは
 * 単価の下に「対象工具の価格表」と出す。
 *
 * 価格表が無いときは「価格表なし」と出すだけでなく、_specs/feature/01-sales.md
 * §1 のとおり **価格試算 と §10 設計依頼へ誘導する**。新規品で単価が引けないのは
 * たいてい「まだ図面が無い」からで、そこで手が止まるのが一番困るため。
 */

import { Anchor, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  searchProductItemOptions,
  searchRegrindItemOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { productItemF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp } from "@/lib/field-help";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_OPTIONS } from "@/lib/mock";
import type { PriceListEntry } from "./price-lists/model";
import {
  lineToolItemId,
  type PriceMissReason,
  resolvePriceFromEntries,
  resolveUnitPriceFromEntries,
} from "./quotes/model";

/** The slice of a quote line this control owns — 価格は全て自動解決値. */
export interface ResolverValue {
  /** 製品 — 値は品目 id（items.id）。価格表の行と同じ id 空間。 */
  itemId: string;
  productName: string;
  /**
   * 研ぎ直す工具（品目 id の文字列）。再研磨の行だけが持つ — 種別を再研磨から
   * 外すと空に戻す。
   */
  toolItemId: string | null;
  /** 研ぎ直す工具の表示名（SearchSelect の初期表示用）。 */
  toolLabel: string | null;
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
  value,
  onChange,
  designRequestHref,
  standardPrices,
  toolError,
}: {
  /** 研ぎ直す工具の検証エラー（フォームから渡す）。 */
  toolError?: ReactNode;
  customerId: string;
  /** 顧客の価格表エントリ（サーバー取得）— ライブ解決に使用。 */
  entries: PriceListEntry[];
  /**
   * 品目 id → **標準価格**（顧客を問わない定価）。当たる価格表が無いときの
   * 拠り所で、いま値が入るのは再研磨の品目だけ。**保存側と同じものを渡すこと** —
   * 渡し忘れると画面は「価格表なし」と出すのに保存では標準価格が入る。
   */
  standardPrices?: Record<string, number>;
  value: ResolverValue;
  onChange: (next: ResolverValue) => void;
  /**
   * 単価未解決のときに出す「設計依頼を起票」の遷移先を作る。
   * 渡さないと誘導リンクを出さない（価格表画面など、設計依頼が無関係な
   * 呼び出し元のため）。
   */
  designRequestHref?: (itemId: string) => string;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  // 再研磨の行が指すのは**再研磨の品目**（役務）で、製品ではない。
  const isRegrind = value.orderType === "REGRIND";
  const standardOf = (itemId: string) => standardPrices?.[itemId] ?? null;

  /** Re-resolve 単価・値引き from the 価格表 when 製品/種別/数量 changes. */
  const reresolve = (patch: Partial<ResolverValue>): ResolverValue => {
    const next = { ...value, ...patch };
    const resolved =
      customerId && next.itemId
        ? resolveUnitPriceFromEntries(
            entries,
            customerId,
            next.itemId,
            next.orderType,
            next.quantity,
            tr,
            new Date(),
            standardOf(next.itemId),
            lineToolItemId(next),
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
  const unresolved = Boolean(value.itemId) && value.priceTierId == null;
  // 当たったのが工具ごとの価格表か — 同じ単価でも「工具を問わない値段」と
  // 言い分ける（注文請書の明細のバッジと同じ印）。
  const toolSpecific =
    !unresolved &&
    isRegrind &&
    Boolean(customerId && value.itemId) &&
    resolveUnitPriceFromEntries(
      entries,
      customerId,
      value.itemId,
      value.orderType,
      value.quantity,
      tr,
      new Date(),
      standardOf(value.itemId),
      lineToolItemId(value),
    )?.toolSpecific === true;
  // 引けない理由（価格表なし / 無効 / 有効期間外 / 数量段階なし）— 「価格表なし」
  // の一言だと、数量を直せば通る行と価格表の登録が要る行の区別がつかない。
  const missReason: PriceMissReason | null =
    unresolved && customerId && value.itemId
      ? (() => {
          const r = resolvePriceFromEntries(
            entries,
            customerId,
            value.itemId,
            value.orderType,
            value.quantity,
            tr,
            new Date(),
            standardOf(value.itemId),
            lineToolItemId(value),
          );
          return r.ok ? null : r.reason;
        })()
      : null;
  const missReasonLabel = (() => {
    switch (missReason) {
      case "no-tier":
        return tr("common.noPriceListTier");
      case "inactive":
        return tr("common.priceListInactive");
      case "expired":
        return tr("common.priceListExpired");
      case "unapproved":
        return tr("common.priceListUnapproved");
      default:
        return tr("common.noPriceList");
    }
  })();

  return (
    <Stack gap="xs">
      <Group align="flex-end" gap="sm" wrap={isMobile ? "wrap" : "nowrap"}>
        <SearchSelect
          f4={isRegrind ? undefined : productItemF4(tr)}
          flex={isMobile ? "1 1 100%" : 2}
          initialOption={
            value.itemId
              ? { value: value.itemId, label: value.productName }
              : null
          }
          label={
            isRegrind
              ? tr("sales.orderAcceptanceItemsEditor.regrindItem")
              : tr("common.product")
          }
          onChange={(v, opt) =>
            onChange(
              reresolve({ itemId: v ?? "", productName: opt?.label ?? "" }),
            )
          }
          onSearch={
            isRegrind ? searchRegrindItemOptions : searchProductItemOptions
          }
          placeholder={
            isRegrind
              ? tr("sales.orderAcceptanceItemsEditor.searchTheRegrindItems")
              : tr("common.searchProducts")
          }
          storageKey={isRegrind ? "quote-regrind-item" : "quote-product-item"}
          value={value.itemId || null}
          withAsterisk
        />
        <Select
          data={ORDER_TYPE_OPTIONS}
          flex={isMobile ? 1 : 1}
          label={tr("common.orderType")}
          onChange={(v) => {
            const next = v ?? "PRODUCTION";
            // 再研磨とそれ以外では品目の種類そのものが違う（役務 / 製品）。
            // 跨いだら選び直し — 残すと保存側の検査で必ず弾かれる行になる。
            const crosses = (next === "REGRIND") !== isRegrind;
            // 工具は再研磨の行だけが持つ（外したら空に戻す）。
            onChange(
              reresolve({
                orderType: next,
                ...(crosses ? { itemId: "", productName: "" } : {}),
                ...(next === "REGRIND"
                  ? {}
                  : { toolItemId: null, toolLabel: null }),
              }),
            );
          }}
          value={value.orderType}
          withAsterisk
        />
        <NumberInput
          flex={isMobile ? 1 : 1}
          label={tr("common.quantity")}
          min={1}
          onChange={(v) =>
            onChange(reresolve({ quantity: typeof v === "number" ? v : 0 }))
          }
          value={value.quantity}
          withAsterisk
        />
        <Stack
          align={isMobile ? "flex-start" : "flex-end"}
          flex={isMobile ? 1 : 1.1}
          gap={2}
        >
          <Text c="dimmed" component="div" size="xs">
            <HelpLabel
              help={tr(
                "sales.productPriceResolverInput.resolvedAutomaticallyFromThePriceList",
              )}
              label={tr("common.unitPricePriceList")}
            />
          </Text>
          {unresolved ? (
            <Stack align={isMobile ? "flex-start" : "flex-end"} gap={0}>
              <Text c="orange" fw={600} size="xs">
                {missReasonLabel}
              </Text>
              {designRequestHref && missReason !== "no-tier" && (
                <Anchor
                  href={designRequestHref(value.itemId)}
                  size="xs"
                  target="_blank"
                >
                  {tr("common.raiseADesignRequest")}
                </Anchor>
              )}
            </Stack>
          ) : (
            <Stack align={isMobile ? "flex-start" : "flex-end"} gap={0}>
              <Text className="tabular-nums" ff="mono" size="sm">
                {formatMoney(value.unitPrice)}
              </Text>
              {toolSpecific && (
                <Text c="blue" size="xs">
                  {tr("sales.productPriceResolverInput.targetToolPrice")}
                </Text>
              )}
            </Stack>
          )}
        </Stack>
        <Stack
          align={isMobile ? "flex-start" : "flex-end"}
          flex={isMobile ? 1 : 1.1}
          gap={2}
        >
          <Text c="dimmed" component="div" size="xs">
            <HelpLabel
              help={tr(
                "sales.productPriceResolverInput.appliedAutomaticallyFromThePriceList",
              )}
              label={tr("sales.productPriceResolverInput.discountAutomatic")}
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
            {tr("common.amount")}
          </Text>
          <Text className="tabular-nums" ff="mono" fw={600} size="sm">
            {formatMoney(amount)}
          </Text>
        </Stack>
      </Group>
      {/*
      研ぎ直す工具（再研磨の行だけ）。自社の製品でも他社製品でもよい —
      注文請書の明細と同じ欄。値段は工具で引き分けられ得るので必須。
    */}
      {isRegrind && (
        <SearchSelect
          error={toolError}
          initialOption={
            value.toolItemId
              ? {
                  value: value.toolItemId,
                  label: value.toolLabel ?? value.toolItemId,
                }
              : null
          }
          label={<HelpLabel {...fieldHelp(tr, "quote", "tool")} />}
          maw={isMobile ? undefined : 480}
          onChange={(v, opt) =>
            onChange(
              reresolve({ toolItemId: v, toolLabel: opt?.label ?? null }),
            )
          }
          onSearch={(q) =>
            searchProductItemOptions(q, { includeExternal: true })
          }
          placeholder={tr(
            "sales.orderAcceptanceItemsEditor.searchTheToolBeingHeld",
          )}
          storageKey="quote-line-tool-item"
          value={value.toolItemId}
          withAsterisk
        />
      )}
    </Stack>
  );
}
