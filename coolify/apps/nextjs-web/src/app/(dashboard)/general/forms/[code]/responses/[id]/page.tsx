import { notFound } from "next/navigation";
import type { RelatedTable } from "@/components/forms/FormResponseView";
import { ResponseDetail } from "@/components/forms/ResponseDetail";
import {
  fetchApprovalState,
  fetchApprovalTrail,
  hasAnyApproval,
  isApproverOf,
} from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listMemos } from "@/lib/document-memos";
import { canEditResponse } from "@/lib/form-schema";
import { fetchResponse, formAccess, resolveRelatedRecords } from "@/lib/forms";
import { responseInScope } from "@/lib/share-grants-core";

export const dynamic = "force-dynamic";

export default async function ResponseDetailPage({
  params,
}: {
  params: Promise<{ code: string; id: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { id } = await params;
  const response = await fetchResponse(id);
  if (!response) notFound();

  const userId = await sessionUserId();
  const access = await formAccess(response.form);
  const isOwner = !!userId && response.submittedBy === userId;
  // 自分の回答は共有設定に関係なく読める。他人の回答は「閲覧」以上が要り、
  // さらに共有に条件が付いていればその条件に当てはまるものだけ。
  const inScope =
    access.canRead && responseInScope(access.responseScope, response.answers);
  // 承認を頼まれた人は、共有が「回答のみ」でもこの書類を開ける必要がある
  // （読めなければ承認しようがない）。
  const isApprover = await isApproverOf("form_responses", id, userId);
  if (!inScope && !isOwner && !isApprover) notFound();

  // 「回答者を表示しない」フォームでは、操作履歴の実行者名と添付のアップロード者名が
  // そのまま回答者を指してしまう。本人以外には渡さない — 画面で隠すのではなく
  // props に載せない（送ってから隠すのは事故のもと）。
  const hideIdentity =
    response.form.respondentVisibility === "HIDDEN" && !isOwner;

  const [approvalState, approvalTrail, rawAttachments, memos, rawAudit] =
    await Promise.all([
      response.form.approvalEnabled
        ? fetchApprovalState("form_responses", id)
        : Promise.resolve(null),
      response.form.approvalEnabled
        ? fetchApprovalTrail("form_responses", id)
        : Promise.resolve([]),
      listAttachments("form_responses", id),
      listMemos("form_responses", id),
      hideIdentity
        ? Promise.resolve([])
        : fetchAuditEntries("form_responses", id),
    ]);

  const firstApprovalDone =
    response.status === "REQUESTED" &&
    (await hasAnyApproval("form_responses", id, response.createdAt));

  const attachments = hideIdentity
    ? rawAttachments.map((a) => ({ ...a, uploadedBy: "—" }))
    : rawAttachments;
  const auditEntries = rawAudit;

  // 関連レコード一覧はサーバ側で解決する（参照先を読む権限もここで見る）。
  const related: Record<string, RelatedTable> = {};
  for (const field of response.fields) {
    if (field.type !== "related") continue;
    related[field.key] = await resolveRelatedRecords(
      field,
      response.answers[field.related?.thisFieldKey ?? ""],
      isOwner ? undefined : access.responseScope,
    );
  }

  return (
    <ResponseDetail
      answers={response.answers}
      approvalEnabled={response.form.approvalEnabled}
      approvalTrail={approvalTrail}
      attachments={attachments}
      auditEntries={auditEntries}
      availability={response.form.availability}
      canActOnApproval={approvalState?.canAct ?? false}
      canEdit={
        !!userId &&
        canEditResponse(
          response.form,
          { submittedBy: response.submittedBy, status: response.status },
          userId,
          new Date(),
          firstApprovalDone,
        )
      }
      createdAt={response.createdAt.toISOString()}
      fields={response.fields}
      formCode={response.form.code}
      formTitle={response.form.title}
      hideHistory={hideIdentity}
      isOwner={isOwner}
      memos={memos}
      recordNo={response.recordNo}
      rejectReason={response.rejectReason}
      related={related}
      respondent={response.respondent}
      responseNumber={response.responseNumber}
      status={response.status}
      submittedAt={response.submittedAt?.toISOString() ?? null}
      updatedAt={response.updatedAt.toISOString()}
    />
  );
}
