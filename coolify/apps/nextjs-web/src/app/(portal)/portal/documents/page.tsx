/**
 * /portal/documents — 自社宛の書類一覧。
 *
 * 種別ごとにタブで分ける。表示は許可リストの DTO だけ
 * （portal-progress-core.ts。素の行は返さない）。
 */

import { Stack, Title } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { PortalDocumentTabs } from "@/components/portal/PortalDocumentTabs";
import {
  listPortalDocuments,
  PORTAL_DOCUMENT_TYPES,
} from "@/lib/portal-documents";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const groups = await Promise.all(
    PORTAL_DOCUMENT_TYPES.map(async (type) => ({
      type,
      items: await listPortalDocuments(gate.session, type),
    })),
  );

  return (
    <Stack gap="md">
      <Title order={3}>{tr("portal.documents.document")}</Title>
      <PortalDocumentTabs groups={groups} />
    </Stack>
  );
}
