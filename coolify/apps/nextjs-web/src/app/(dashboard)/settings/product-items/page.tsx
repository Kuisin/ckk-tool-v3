import { Stack } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { ItemDefsListPanel } from "@/components/settings/ItemDefsListPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { getProductItemDefs } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品項目（SY03）— 項目定義ライブラリの一覧。system 権限。 */
export default async function ProductItemsPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("product-items");
  if (denied) return denied;
  const defs = await getProductItemDefs();
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/product-types">
            {tr("settings.productItems.toProductTypes")}
          </SecondaryButton>
        }
        breadcrumbs={[tr("common.system"), tr("common.productItems")]}
        title={tr("common.productItems")}
      />
      <ItemDefsListPanel initial={defs} />
    </Stack>
  );
}
