import { notFound } from "next/navigation";
import {
  type ChartMode,
  FormSummaryView,
} from "@/components/forms/FormSummaryView";
import { sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import type { FormAnswerValue } from "@/lib/form-schema";
import {
  DEFAULT_SUMMARY_OPTIONS,
  submissionTrend,
  summarizeResponses,
} from "@/lib/form-summary";
import { fetchForm, formAccess } from "@/lib/forms";
import { responseInScope } from "@/lib/share-grants-core";

export const dynamic = "force-dynamic";

/** 回答の集計（CM02）。全回答を読む画面なので、閲覧権限が要る。 */
export default async function FormSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ order?: string; grain?: string; chart?: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const sp = await searchParams;
  const order =
    sp.order === "definition" ? "definition" : DEFAULT_SUMMARY_OPTIONS.order;
  const dateGrain =
    sp.grain === "day" ? "day" : DEFAULT_SUMMARY_OPTIONS.dateGrain;
  // 知らない値は「自動」に倒す（URL を手で書き換えられても壊れないように）。
  const chartMode: ChartMode =
    sp.chart === "pie" || sp.chart === "bar" ? sp.chart : "auto";
  const form = await fetchForm(code);
  if (!form) notFound();

  // 集計は全員分を見る操作なので、回答できるだけでは足りない（閲覧以上）。
  const access = await formAccess(form);
  if (!access.canRead) notFound();

  const allRows = await prisma.formResponse.findMany({
    where: { formId: form.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    // 集計はメモリ上で行う。数万件になったら SQL 側へ寄せる（その時が来たら）。
    take: 5000,
    select: {
      answers: true,
      createdAt: true,
      submittedAt: true,
      submittedBy: true,
    },
  });

  // 共有に条件が付いた相手には、その条件に当てはまる回答だけを集計する。
  // ここを素通しにすると、一覧では隠している回答が件数と分布から読めてしまう。
  const viewerId = await sessionUserId();
  const rows = allRows.filter(
    (r) =>
      (viewerId != null && r.submittedBy === viewerId) ||
      responseInScope(
        access.responseScope,
        (r.answers ?? {}) as Record<string, unknown>,
      ),
  );

  const summaries = summarizeResponses(
    form.fields,
    rows.map((r) => (r.answers ?? {}) as Record<string, FormAnswerValue>),
    { order, dateGrain },
  );

  const trend = submissionTrend(
    rows.map((r) => (r.submittedAt ?? r.createdAt).toISOString()),
    dateGrain,
  );

  return (
    <FormSummaryView
      chartMode={chartMode}
      dateGrain={dateGrain}
      formCode={form.code}
      formTitle={form.title}
      lastResponseAt={rows[0]?.createdAt.toISOString() ?? null}
      metabaseUrl={process.env.NEXT_PUBLIC_METABASE_URL ?? null}
      // LAN 限定の URL を焼き込まない。設定されていなければリンクを出さない。
      order={order}
      responseCount={rows.length}
      summaries={summaries}
      trend={trend}
    />
  );
}
