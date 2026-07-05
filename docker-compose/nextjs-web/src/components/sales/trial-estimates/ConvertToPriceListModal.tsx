"use client";

/**
 * ConvertToPriceListModal — 試算 → 価格表 登録（CONFIRMED → REGISTERED）.
 *
 * 価格表は必ず試算から作成する。試算の見積単価が 基準単価 になり、そのまま使う
 * か手動で上書きできる。数量ごとの価格（×倍率）と値引きルールは登録後に価格表
 * 側で設定する。The user picks the 製品 / 注文種別 / 有効期間; the modal always
 * warns if a price list for the same 顧客・製品 already exists. Registering
 * locks the 試算 (価格表登録済) — re-price via 複製して再試算.
 */

import { Alert, Checkbox, NumberInput, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCalendar,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldValue } from "@/components/ui/FieldValue";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormModal,
  type ModalBaseProps,
  openConfirm,
} from "@/components/ui/modals";
import { formatMoney } from "@/lib/format";
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from "@/lib/mock";
import { calcTrialPricing } from "@/lib/trial-pricing";
import {
  entryKey,
  findEntriesByCustomerProduct,
  requiresEndDate,
} from "../price-lists/mock";
import type { TrialEstimateRecord } from "./mock";

export function ConvertToPriceListModal({
  opened,
  onClose,
  estimate,
  onRegistered,
}: ModalBaseProps & {
  estimate: TrialEstimateRecord | null;
  /** Called after登録 — the caller flips the 試算 to REGISTERED. */
  onRegistered?: () => void;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(
    estimate?.customerId ?? null,
  );
  const [productId, setProductId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string>("PRODUCTION");
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 試算の見積単価（基準）— 既定はこの値をそのまま使う。カスタム単価は
  // 明示的なチェック（確認ポップアップ付き）でのみ有効化できる。
  const estimatePrice = estimate
    ? (calcTrialPricing(estimate.input).lots[0]?.estimateUnitPrice ?? 0)
    : 0;
  const [customPrice, setCustomPrice] = useState(false);
  const [baseUnitPrice, setBaseUnitPrice] = useState<number>(estimatePrice);

  // Re-seed when the modal opens for a (new) estimate.
  useEffect(() => {
    if (opened) {
      setCustomerId(estimate?.customerId ?? null);
      setCustomPrice(false);
      setBaseUnitPrice(estimatePrice);
    }
  }, [opened, estimate, estimatePrice]);

  /** カスタム単価の ON/OFF — どちらの向きも確認ポップアップを挟む。 */
  const toggleCustomPrice = (next: boolean) => {
    if (next) {
      openConfirm({
        title: "カスタム単価の使用",
        message: `試算の見積単価（${formatMoney(estimatePrice)}）を使わず、基準単価を手動で設定します。よろしいですか？`,
        confirmLabel: "カスタム設定する",
        onConfirm: () => setCustomPrice(true),
      });
    } else {
      openConfirm({
        title: "試算値に戻す",
        message: `手動で設定した基準単価を破棄し、試算の見積単価（${formatMoney(estimatePrice)}）に戻します。`,
        confirmLabel: "試算値に戻す",
        onConfirm: () => {
          setCustomPrice(false);
          setBaseUnitPrice(estimatePrice);
        },
      });
    }
  };

  const needsEnd = requiresEndDate(orderType);
  const existing = findEntriesByCustomerProduct(customerId, productId);
  const dup = existing.some((e) => e.orderType === orderType);

  const handleClose = () => {
    setProductId(null);
    setOrderType("PRODUCTION");
    setValidFrom(null);
    setValidUntil(null);
    setError(null);
    onClose();
  };

  return (
    <FormModal
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !(customerId && productId && validFrom) ||
          (needsEnd && !validUntil)
        ) {
          setError(
            needsEnd
              ? "顧客・製品・注文種別・有効期間（開始・終了）を入力してください"
              : "顧客・製品・有効開始日を入力してください",
          );
          return;
        }
        // TODO(server-action): create the price_list entry — 基準単価
        // (baseUnitPrice) + 既定 tier (1本〜 ×1.00) — link estimate_id and
        // flip the 試算 to REGISTERED.
        notifications.show({
          title: "価格表に登録しました",
          message: "試算は「価格表登録済」となりました",
          color: "green",
        });
        onRegistered?.();
        handleClose();
        // 作成した価格表の詳細（ビュー）ページへ。
        router.push(
          `/sales/price-lists/${entryKey(customerId, productId, orderType)}`,
        );
      }}
      opened={opened}
      size="lg"
      submitLabel="価格表に登録"
      title="価格表に登録"
    >
      {estimate && (
        <Text size="sm">
          試算「{estimate.estimateNumber}
          」の見積単価を基準単価として価格表に登録します。数量ごとの価格（×倍率）と値引きルールは登録後に価格表で設定できます。
        </Text>
      )}
      <Select
        data={CUSTOMERS}
        error={error && !customerId ? "顧客を選択してください" : undefined}
        label="顧客"
        onChange={setCustomerId}
        placeholder="顧客を選択"
        searchable
        value={customerId}
        withAsterisk
      />
      <Select
        data={PRODUCTS}
        error={error && !productId ? "製品を選択してください" : undefined}
        label="製品"
        onChange={setProductId}
        placeholder="製品を選択"
        searchable
        value={productId}
        withAsterisk
      />
      <Select
        data={ORDER_TYPE_OPTIONS}
        label="注文種別"
        onChange={(v) => setOrderType(v ?? "PRODUCTION")}
        value={orderType}
        withAsterisk
      />

      {existing.length > 0 && (
        <Alert
          color={dup ? "red" : "orange"}
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          同一顧客・製品の価格表が既に {existing.length} 件あります（
          {existing.map((e) => ORDER_TYPE_LABEL[e.orderType]).join("・")}）。
          {dup && " 選択中の注文種別は既に存在します。"}
        </Alert>
      )}

      <DatePickerInput
        error={error && !validFrom ? "有効開始日を選択してください" : undefined}
        label="有効開始日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidFrom}
        placeholder="日付を選択"
        value={validFrom}
        valueFormat="YYYY/MM/DD"
        withAsterisk
      />
      <DatePickerInput
        clearable={!needsEnd}
        description={needsEnd ? "テスト・サンプルは終了日が必須" : undefined}
        error={
          error && needsEnd && !validUntil
            ? "有効終了日を選択してください"
            : undefined
        }
        label={
          <HelpLabel
            help="空欄で無期限。テスト・サンプルは一時価格のため終了日が必須です。"
            label="有効終了日"
          />
        }
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder={needsEnd ? "日付を選択" : "空欄で無期限"}
        value={validUntil}
        valueFormat="YYYY/MM/DD"
        withAsterisk={needsEnd}
      />

      <FieldValue label="見積単価（試算）" value={formatMoney(estimatePrice)} />
      <Checkbox
        checked={customPrice}
        label={
          <HelpLabel
            help="既定では試算の見積単価をそのまま基準単価に使います。手動で別の単価を設定する場合のみチェックしてください（確認あり）。"
            label="カスタム単価を使用（試算値を上書き）"
          />
        }
        onChange={(e) => toggleCustomPrice(e.currentTarget.checked)}
      />
      <NumberInput
        description={
          customPrice
            ? `手動設定（試算値: ${formatMoney(estimatePrice)}）`
            : "試算値をそのまま使用"
        }
        disabled={!customPrice}
        label={
          <HelpLabel
            help="価格表の基準になる単価。既定は試算の見積単価。各数量帯の単価 = 基準単価 × 倍率。"
            label="基準単価"
          />
        }
        min={0}
        onChange={(v) => setBaseUnitPrice(typeof v === "number" ? v : 0)}
        prefix="¥"
        thousandSeparator=","
        value={baseUnitPrice}
        withAsterisk
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        登録すると試算は「価格表登録済」となり編集できなくなります。単価を見直す場合は複製して再試算してください。数量倍率（×1.01
        など）は登録後に価格表の編集で設定します。
      </Alert>
    </FormModal>
  );
}
