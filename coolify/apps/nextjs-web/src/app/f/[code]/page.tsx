import { notFound } from "next/navigation";
import { RespondFormClient } from "@/components/forms/RespondFormClient";
import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canEditResponse } from "@/lib/form-schema";
import { fetchForm, fetchFormVersionFields, formAccess } from "@/lib/forms";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "フォーム | CKK 業務管理システム",
  // 共有 URL を検索エンジンに拾わせない。
  robots: { index: false, follow: false },
};

/**
 * 共有 URL の回答画面（`/f/<code>`）。
 *
 * `(dashboard)` の外に置いてあるのは、短くてアプリ配下でない URL にするため
 * （`/l/<code>` の外部リンク確認ページと同じ構え）。**いまはログイン必須** —
 * `proxy.ts` の matcher は触っていない。将来社外へ開くときは matcher に
 * `f(?:$|/)` を足せばよく、データ側は共有設定で既に表現できている。
 */
export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ response?: string }>;
}) {
  const { code } = await params;
  const { response: responseNumber } = await searchParams;

  const form = await fetchForm(code);
  if (!form) notFound();

  // 共有されていない人には、URL を知っていても存在を教えない。
  const access = await formAccess(form);
  if (!access.canRespond) notFound();

  const userId = await sessionUserId();
  if (!userId) notFound();

  // 自分の回答を編集しに来た場合は、その回答の版で描く。
  let existing: {
    responseNumber: string;
    answers: Record<string, unknown>;
    version: number;
  } | null = null;
  if (responseNumber) {
    const row = await prisma.formResponse.findUnique({
      where: { responseNumber },
      select: {
        responseNumber: true,
        answers: true,
        version: true,
        formId: true,
        status: true,
        submittedBy: true,
      },
    });
    if (
      row &&
      row.formId === form.id &&
      canEditResponse(form, row, userId, new Date())
    ) {
      existing = {
        responseNumber: row.responseNumber,
        answers: (row.answers ?? {}) as Record<string, unknown>,
        version: row.version,
      };
    }
  }

  const fields = existing
    ? await fetchFormVersionFields(form.id, existing.version)
    : form.fields;

  if (fields.length === 0) notFound();

  return (
    <RespondFormClient
      availability={form.availability}
      closesAt={form.closesAt?.toISOString() ?? null}
      code={code}
      description={form.description}
      existing={existing}
      fields={fields}
      title={form.title}
    />
  );
}
