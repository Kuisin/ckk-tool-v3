/**
 * /portal/documents/[type]/[number] — 書類 1 件。
 *
 * 認可は requirePortalView(target) が見る。**見えないものは 404**
 * （「権限がありません」だと、その書類が存在することを教えてしまう）。
 * 開いたことは portal_access_logs に残す。
 */

import { Anchor, Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { parseDocKey } from "@/lib/doc-number";
import { recordPortalAccess } from "@/lib/portal-access-log";
import {
  getPortalDocument,
  isPortalDocumentType,
  PORTAL_DOCUMENT_LABEL,
  portalTargetOf,
} from "@/lib/portal-documents";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalDocumentPage({
  params,
}: {
  params: Promise<{ type: string; number: string }>;
}) {
  const tr = await getTranslations();
  const { type, number } = await params;
  if (!isPortalDocumentType(type)) notFound();
  const key = parseDocKey(decodeURIComponent(number));
  if (!key) notFound();

  const target = await portalTargetOf(type, key.yearMonth, key.seq);
  // 存在しない書類も、見えない書類も同じ 404。
  const gate = await requirePortalView(target ?? undefined);
  if (!gate.ok) return gate.view;
  if (!target) notFound();

  const doc = await getPortalDocument(
    gate.session,
    type,
    key.yearMonth,
    key.seq,
  );
  if (!doc) notFound();

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: type,
    resourceId: doc.number,
    action: "VIEW",
    ipAddress: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });

  return (
    <Stack gap="md">
      <Title order={3}>{PORTAL_DOCUMENT_LABEL[type]}</Title>
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="sm">
          <Group gap="xs">
            <Text c="dimmed" size="xs">
              {tr("common.documentNumber")}
            </Text>
            <Text ff="monospace" fw={600} size="sm">
              {doc.number}
            </Text>
          </Group>
          {doc.issuedOn ? (
            <Group gap="xs">
              <Text c="dimmed" size="xs">
                {tr("common.date")}
              </Text>
              <Text size="sm">{doc.issuedOn.slice(0, 10)}</Text>
            </Group>
          ) : null}
          {doc.totalAmount ? (
            <Group gap="xs">
              <Text c="dimmed" size="xs">
                {tr("common.totalAmount")}
              </Text>
              <Text fw={600} size="sm">
                ¥{Number(doc.totalAmount).toLocaleString("ja-JP")}
              </Text>
            </Group>
          ) : null}
          {doc.hasPdf && doc.pdfFileId ? (
            <Anchor
              href={`/portal/api/file/${doc.pdfFileId}?doc=${type}&no=${encodeURIComponent(doc.number)}`}
              size="sm"
              target="_blank"
            >
              <Group gap={4}>
                <IconFileTypePdf size={14} />
                {tr("common.openThePdf")}
              </Group>
            </Anchor>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
