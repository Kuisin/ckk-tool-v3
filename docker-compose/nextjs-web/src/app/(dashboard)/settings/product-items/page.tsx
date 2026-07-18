import { Stack } from "@mantine/core";
import { ItemDefsListPanel } from "@/components/settings/ItemDefsListPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductItemDefs } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品項目（SY04）— 項目定義ライブラリの一覧。system 権限。 */
export default async function ProductItemsPage() {
  const defs = await getProductItemDefs();
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/product-items/types">
            製品種別の管理
          </SecondaryButton>
        }
        breadcrumbs={["システム", "製品項目"]}
        title="製品項目 — 項目定義"
      />
      <ItemDefsListPanel initial={defs} />
    </Stack>
  );
}
