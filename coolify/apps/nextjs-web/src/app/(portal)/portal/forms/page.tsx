/**
 * /portal/forms — 共有されているフォームの回答（読むだけ）。
 *
 * 社外の人が回答するのは v1 の対象外（form_responses.submitted_by が
 * users.id への FK なので、別途スキーマ変更が要る）。
 */

import { Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listPortalForms } from "@/lib/portal-forms";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalFormsPage() {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const forms = await listPortalForms(gate.session);

  return (
    <Stack gap="md">
      <Title order={3}>{tr("common.forms")}</Title>
      {forms.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("portal.forms.noFormsAreSharedWithYou")}
        </Text>
      ) : (
        forms.map((f) => (
          // カード全体を押せるようにする（狭い画面で題名の文字だけを狙わせない）。
          // Server Component なので Link を直接使う（`component={Link}` で
          // クライアントの部品へ関数を渡すと描画時に落ちる）。
          <Link
            href={`/portal/forms/${encodeURIComponent(f.code)}`}
            key={f.code}
            style={{
              color: "inherit",
              display: "block",
              textDecoration: "none",
            }}
          >
            <Card padding="md" radius="md" withBorder>
              <Group gap="sm" justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm" style={{ minWidth: 0 }} truncate>
                  {f.title}
                </Text>
                <Group gap={4} style={{ flexShrink: 0 }} wrap="nowrap">
                  <Text c="dimmed" size="xs">
                    {tr("portal.forms.responseCount", {
                      count: f.responseCount,
                    })}
                  </Text>
                  <IconChevronRight size={14} />
                </Group>
              </Group>
            </Card>
          </Link>
        ))
      )}
    </Stack>
  );
}
