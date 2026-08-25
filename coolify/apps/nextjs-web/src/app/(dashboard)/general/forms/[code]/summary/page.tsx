import { notFound } from "next/navigation";
import { FormSummaryView } from "@/components/forms/FormSummaryView";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import type { FormAnswerValue } from "@/lib/form-schema";
import { summarizeResponses } from "@/lib/form-summary";
import { fetchForm, formAccess } from "@/lib/forms";

export const dynamic = "force-dynamic";

/** 回答の集計（CM02）。全回答を読む画面なので、閲覧権限が要る。 */
export default async function FormSummaryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) notFound();

  // 集計は全員分を見る操作なので、回答できるだけでは足りない（閲覧以上）。
  const access = await formAccess(form);
  if (!access.canRead) notFound();

  const rows = await prisma.formResponse.findMany({
    where: { formId: form.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    // 集計はメモリ上で行う。数万件になったら SQL 側へ寄せる（その時が来たら）。
    take: 5000,
    select: { answers: true, createdAt: true },
  });

  const summaries = summarizeResponses(
    form.fields,
    rows.map((r) => (r.answers ?? {}) as Record<string, FormAnswerValue>),
  );

  return (
    <FormSummaryView
      formCode={form.code}
      formTitle={form.title}
      lastResponseAt={rows[0]?.createdAt.toISOString() ?? null}
      responseCount={rows.length}
      summaries={summaries}
    />
  );
}
