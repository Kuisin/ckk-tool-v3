import { SimpleGrid, Stack } from "@mantine/core";
import { HubCard } from "@/components/settings/SystemSettingsHub";
import { PageHeader } from "@/components/ui/PageHeader";
import { resolveAppIcon } from "@/lib/icons";
import { SETTINGS_APPS } from "@/lib/settings-apps";

export const dynamic = "force-dynamic";

/** アプリ設定インデックス — 設定可能なアプリの一覧。 */
export default function AppSettingsIndexPage() {
  return (
    <Stack gap="xl" maw={1000}>
      <PageHeader
        breadcrumbs={["システム", "システム設定"]}
        title="アプリ設定"
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {SETTINGS_APPS.map((app) => (
          <HubCard
            color="blue"
            description={app.description}
            href={app.href}
            icon={resolveAppIcon(app.icon)}
            key={app.key}
            label={app.label}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
