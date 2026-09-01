/**
 * /portal/forms/[code] — 1 つのフォームの回答。
 *
 * 絞り込みは share-grants-core.ts の responseInScope を再利用する
 * （共有条件の規則を二重に書かない）。共有されていなければ 404。
 */

import { Stack, Table, Text, Title } from "@mantine/core";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { recordPortalAccess } from "@/lib/portal-access-log";
import { listPortalFormResponses } from "@/lib/portal-forms";
import { requirePortalView } from "@/lib/portal-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function PortalFormPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const tr = await getTr();
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
      <Title order={3}>{tr("フォームの回答")}</Title>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("表示できる回答はありません。")}
        </Text>
      ) : (
        <Table highlightOnHover striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("回答番号")}</Table.Th>
              <Table.Th>{tr("提出日")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.responseNumber}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {r.responseNumber}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.submittedOn ?? "—"}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
