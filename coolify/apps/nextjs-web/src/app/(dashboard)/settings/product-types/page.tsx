import { Stack } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { ProductTypesListPanel } from "@/components/settings/ProductTypesListPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { getProductTypes } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別（SY04）— 製品種別の一覧。system 権限。 */
export default async function ProductTypesPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("product-types");
  if (denied) return denied;
  const types = await getProductTypes();
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/product-items">
            {tr("settings.productTypes.toProductItems")}
          </SecondaryButton>
        }
        breadcrumbs={[tr("common.system"), tr("common.productTypes")]}
        title={tr("common.productTypes")}
      />
      <ProductTypesListPanel initial={types} />
    </Stack>
  );
}
