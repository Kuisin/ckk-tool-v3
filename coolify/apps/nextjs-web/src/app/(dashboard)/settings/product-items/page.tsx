import { Stack } from "@mantine/core";
import { ItemDefsListPanel } from "@/components/settings/ItemDefsListPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { getProductItemDefs } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品項目（SY03）— 項目定義ライブラリの一覧。system 権限。 */
export default async function ProductItemsPage() {
  const denied = await requireAppRead("product-items");
  if (denied) return denied;
  const defs = await getProductItemDefs();
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/product-types">
            製品種別へ
          </SecondaryButton>
        }
        breadcrumbs={["システム", "製品項目"]}
        title="製品項目"
      />
      <ItemDefsListPanel initial={defs} />
    </Stack>
  );
}
