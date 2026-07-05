import { IconCalculator } from "@tabler/icons-react";
import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * 価格表 新規作成 (SA11).
 *
 * 価格表は必ず試算（SA05）の「価格表に登録」から作成する。素の新規作成は
 * 案内のみ表示する。`?customer=&product=` 付き（既存エントリからの
 * 「注文種別を追加」フロー）のみフォームを開く。
 */
export default async function PriceListNewPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; product?: string }>;
}) {
  const { customer, product } = await searchParams;

  if (!(customer && product)) {
    return (
      <EmptyState
        action={
          <SecondaryButton href="/sales/trial-estimates">
            試算一覧へ
          </SecondaryButton>
        }
        icon={<IconCalculator size={24} />}
        message="価格表は試算（SA05）を確定して「価格表に登録」から作成します。"
      />
    );
  }

  return (
    <PriceListTypeForm
      lockedCustomerId={customer}
      lockedProductId={product}
      mode="create"
    />
  );
}
