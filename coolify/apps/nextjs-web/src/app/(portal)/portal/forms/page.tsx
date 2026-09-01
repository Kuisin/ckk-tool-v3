/**
 * /portal/forms — 共有されているフォームの回答（読むだけ）。
 *
 * 社外の人が回答するのは v1 の対象外（form_responses.submitted_by が
 * users.id への FK なので、別途スキーマ変更が要る）。
 */

import { Anchor, Card, Group, Stack, Text, Title } from "@mantine/core";
import { listPortalForms } from "@/lib/portal-forms";
import { requirePortalView } from "@/lib/portal-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function PortalFormsPage() {
  const tr = await getTr();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const forms = await listPortalForms(gate.session);

  return (
    <Stack gap="md">
      <Title order={3}>{tr("フォーム")}</Title>
      {forms.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("共有されているフォームはありません。")}
        </Text>
      ) : (
        forms.map((f) => (
          <Card key={f.code} padding="md" radius="md" withBorder>
            <Group justify="space-between">
              <Anchor href={`/portal/forms/${encodeURIComponent(f.code)}`}>
                <Text fw={600} size="sm">
                  {f.title}
                </Text>
              </Anchor>
              <Text c="dimmed" size="xs">
                {f.responseCount} 件
              </Text>
            </Group>
          </Card>
        ))
      )}
    </Stack>
  );
}
