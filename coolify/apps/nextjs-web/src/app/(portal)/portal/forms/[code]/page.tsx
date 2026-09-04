/**
 * /portal/forms/[code] — 1 つのフォームの回答。
 *
 * 絞り込みは share-grants-core.ts の responseInScope を再利用する
 * （共有条件の規則を二重に書かない）。共有されていなければ 404。
 * 行を押すと回答 1 件の中身へ。
 */

import { Stack, Title } from "@mantine/core";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PortalFormResponseTable } from "@/components/portal/PortalFormResponseTable";
import { recordPortalAccess } from "@/lib/portal-access-log";
import { listPortalFormResponses } from "@/lib/portal-forms";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalFormPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const rows = await listPortalFormResponses(gate.session, decoded);
  // 共有されていないフォームは「無い」と同じ扱い。
  if (rows === null) notFound();

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: "forms",
    resourceId: decoded,
    action: "VIEW",
    ipAddress: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });

  return (
    <Stack gap="md">
      <Title order={3}>{tr("common.formResponses")}</Title>
      <PortalFormResponseTable code={decoded} rows={rows} />
    </Stack>
  );
}
