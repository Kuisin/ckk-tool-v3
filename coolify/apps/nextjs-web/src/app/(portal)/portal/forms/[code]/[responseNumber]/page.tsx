/**
 * /portal/forms/[code]/[responseNumber] — 回答 1 件。
 *
 * 一覧は番号と提出日しか出せない（どれを開けばよいか判らない）ので、中身は
 * ここで読む。共有されていないフォーム・共有条件に当たらない回答は、一覧と
 * まったく同じ規則で 404（詳細だけ広く見えることが無いように、判定は
 * `getPortalFormResponse` が一覧の関数を通す）。
 */

import { Stack, Text, Title } from "@mantine/core";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PortalAnswerView } from "@/components/portal/PortalAnswerView";
import { PortalBackLink } from "@/components/portal/PortalDetail";
import { recordPortalAccess } from "@/lib/portal-access-log";
import { getPortalFormResponse } from "@/lib/portal-forms";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalFormResponsePage({
  params,
}: {
  params: Promise<{ code: string; responseNumber: string }>;
}) {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const { code, responseNumber } = await params;
  const formCode = decodeURIComponent(code);
  const number = decodeURIComponent(responseNumber);

  const response = await getPortalFormResponse(gate.session, formCode, number);
  if (!response) notFound();

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: "form_responses",
    resourceId: response.responseNumber,
    action: "VIEW",
    ipAddress: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });

  return (
    <Stack gap="md">
      <PortalBackLink
        href={`/portal/forms/${encodeURIComponent(formCode)}`}
        label={response.formTitle}
      />

      <Stack gap={4}>
        <Title order={3}>{response.formTitle}</Title>
        <Text c="dimmed" size="sm">
          <Text component="span" ff="monospace" size="sm">
            {response.responseNumber}
          </Text>
          {response.submittedOn
            ? ` · ${tr("common.submittedOn")} ${response.submittedOn}`
            : ""}
        </Text>
      </Stack>

      <PortalAnswerView answers={response.answers} fields={response.fields} />
    </Stack>
  );
}
