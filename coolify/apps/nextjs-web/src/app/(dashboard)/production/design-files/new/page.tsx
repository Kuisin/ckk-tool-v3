import { Stack } from "@mantine/core";
import { DesignFileVersionForm } from "@/components/production/design-files/DesignFileVersionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchCustomerOptions,
  fetchDesignRequestContext,
  fetchProductOption,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計図 新規 (PD16) — 版を 1 つ登録する。
 *
 * プリフィルは 2 経路。`?request=DSG-…`（設計依頼の成果物として登録）と
 * `?product=<id>`（製品マスタ・一覧から）。どちらも**実在を確かめてから**
 * フォームへ渡す — クエリをそのまま信じると、存在しない依頼の成果物や
 * 別製品の図面を作れてしまう。
 */
export default async function ProductionDesignFileNewPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; product?: string }>;
}) {
  const denied = await requireAppRead("design-files");
  if (denied) return denied;

  const sp = await searchParams;
  const productId = Number(sp.product);
  const [customerOptions, requestContext, initialProduct] = await Promise.all([
    fetchCustomerOptions(),
    sp.request ? fetchDesignRequestContext(sp.request) : null,
    Number.isInteger(productId) && productId > 0
      ? fetchProductOption(productId)
      : null,
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={["生産", "設計図", "新規"]}
        title="設計図を登録"
      />
      <DesignFileVersionForm
        customerOptions={customerOptions}
        initialProduct={initialProduct}
        requestContext={requestContext}
      />
    </Stack>
  );
}
