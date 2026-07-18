import { Stack } from "@mantine/core";
import { ProductTypesListPanel } from "@/components/settings/ProductTypesListPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductTypes } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別（SY05）— 製品種別の一覧。system 権限。 */
export default async function ProductTypesPage() {
  const types = await getProductTypes();
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/product-items">
            製品項目へ
          </SecondaryButton>
        }
        breadcrumbs={["システム", "製品種別"]}
        title="製品種別"
      />
      <ProductTypesListPanel initial={types} />
    </Stack>
  );
}
