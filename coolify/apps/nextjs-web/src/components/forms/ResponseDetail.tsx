"use client";

import { Alert, Tabs, Text } from "@mantine/core";
import { IconFileTypePdf, IconLink } from "@tabler/icons-react";
import {
  approveResponse,
  rejectResponse,
  updateResponse,
} from "@/app/(dashboard)/general/forms/actions";
import type { ApprovalTrailView } from "@/components/approvals/ApprovalTrailList";
import { ApprovalTrailList } from "@/components/approvals/ApprovalTrailList";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { AttachmentsPanel } from "@/components/ui/AttachmentsPanel";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import type { MemoView } from "@/lib/document-memos";
import type {
  FormAnswerValue,
  FormAvailability,
  FormFieldDef,
} from "@/lib/form-schema";
import { FormResponseView, type RelatedTable } from "./FormResponseView";
import { RespondForm } from "./RespondForm";
import { ResponseApprovalCard } from "./ResponseApprovalCard";

export function ResponseDetail({
  formCode,
  formTitle,
  responseNumber,
  recordNo,
  status,
  respondent,
  submittedAt,
  rejectReason,
  fields,
  answers,
  related,
  availability,
  approvalEnabled,
  approvalTrail,
  canActOnApproval,
  isOwner,
  canEdit,
  hideHistory = false,
  attachments,
  memos,
  auditEntries,
  createdAt,
  updatedAt,
}: {
  formCode: string;
  formTitle: string;
  responseNumber: string;
  recordNo: number;
  status: string;
  respondent: string | null;
  submittedAt: string | null;
  rejectReason: string | null;
  fields: FormFieldDef[];
  answers: Record<string, FormAnswerValue>;
  related: Record<string, RelatedTable>;
  /** フォームの受付状態。回答タブの中で編集するときの送信可否に使う。 */
  availability: FormAvailability;
  approvalEnabled: boolean;
  approvalTrail: ApprovalTrailView[];
  canActOnApproval: boolean;
  isOwner: boolean;
  canEdit: boolean;
  /** 匿名集計フォームを他人が見るとき — 実行者名が回答者を指すので履歴を出さない。 */
  hideHistory?: boolean;
  attachments: AttachmentView[];
  memos: MemoView[];
  auditEntries: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}) {
  const fmt = useFormat();

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              // 1 件だけの控え。承認の記録まで載るので、紙で回す申請にも使える。
              label: "PDF で印刷",
              icon: <IconFileTypePdf size={14} />,
              href: `/api/pdf/form-response?id=${encodeURIComponent(responseNumber)}`,
            },
            {
              // 回答者に配っている画面。作成者が「相手にはこう見える」を
              // 確かめられるように残す（編集は回答タブの中でする）。
              label: "回答者向けの画面で開く",
              icon: <IconLink size={14} />,
              href: `/f/${formCode}/${encodeURIComponent(responseNumber)}`,
            },
          ]}
        />
      }
      breadcrumbs={[
        { label: "一般" },
        { label: "フォーム", href: "/general/forms" },
        { label: formTitle, href: `/general/forms/${formCode}` },
        { label: `No. ${recordNo}` },
      ]}
      createdAt={fmt.dateTime(createdAt)}
      status={<StatusBadge entity="FormResponse" status={status} />}
      title={`${formTitle} — No. ${recordNo}`}
      updatedAt={fmt.dateTime(updatedAt)}
    >
      {approvalEnabled && (
        <ResponseApprovalCard
          canAct={canActOnApproval}
          onApprove={async (n) => {
            const r = await approveResponse(n);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
          onReject={async (n, reason) => {
            const r = await rejectResponse(n, reason);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
          responseNumber={responseNumber}
          status={status}
        />
      )}

      <SummaryGrid>
        <FieldValue label="No." value={recordNo} />
        <FieldValue
          label="回答番号"
          value={
            <Text ff="mono" size="sm">
              {responseNumber}
            </Text>
          }
        />
        {/* 回答者は「表示する」フォームだけ。HIDDEN のときはサーバが null にしている。 */}
        {respondent !== null && (
          <FieldValue label="回答者" value={respondent} />
        )}
        <FieldValue
          label="提出日時"
          value={submittedAt ? fmt.dateTime(submittedAt) : "—"}
        />
      </SummaryGrid>

      {status === "REJECTED" && rejectReason && (
        <Alert color="red" title="差し戻されています">
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {rejectReason}
          </Text>
          {isOwner && (
            <Text mt={4} size="xs">
              「回答」タブで内容を直して保存すると、もう一度承認を依頼します。
            </Text>
          )}
        </Alert>
      )}

      <Tabs defaultValue="answers">
        <Tabs.List>
          <Tabs.Tab value="answers">回答</Tabs.Tab>
          {approvalEnabled && <Tabs.Tab value="approval">承認</Tabs.Tab>}
          <Tabs.Tab value="attachments">添付</Tabs.Tab>
          <Tabs.Tab value="memo">コメント</Tabs.Tab>
          {!hideHistory && <Tabs.Tab value="history">履歴</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel pt="md" value="answers">
          <EditablePanel
            canEdit={canEdit}
            edit={({ close }) => (
              <RespondForm
                // 下書きのまま置けるのは、まだ出していない回答だけ。
                allowDraft={status === "DRAFT"}
                availability={availability}
                embedded
                // **回答した時点の版**の項目で直す（form_versions は不変）。
                fields={fields}
                initialAnswers={answers}
                onCancel={close}
                onSubmit={async (next, asDraft) => {
                  const r = await updateResponse(responseNumber, next, asDraft);
                  // 下書きを保存しただけなら書き続けられるよう開いたままにする。
                  // 画面の再取得は RespondForm 側が router.refresh() でやる。
                  if (r.ok && !asDraft) close();
                  return r.ok ? { ok: true } : { ok: false, error: r.error };
                }}
                submitLabel={status === "DRAFT" ? "提出する" : "更新"}
                // 編集は受付終了後も許される設定があるので送信可否は別扱い。
                // 最終判定はサーバ（canEditResponse / formAvailability）。
                submittable={
                  status === "DRAFT" ? availability === "OPEN" : true
                }
                title={formTitle}
              />
            )}
            view={
              <FormResponseView
                answers={answers}
                fields={fields}
                related={related}
              />
            }
          />
        </Tabs.Panel>

        {approvalEnabled && (
          <Tabs.Panel pt="md" value="approval">
            <ApprovalTrailList trail={approvalTrail} />
          </Tabs.Panel>
        )}

        <Tabs.Panel pt="md" value="attachments">
          <AttachmentsPanel
            attachments={attachments}
            canDelete={canEdit}
            canUpload={canEdit}
            ownerId={responseNumber}
            ownerType="form_responses"
          />
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="comment"
            ownerId={responseNumber}
            ownerType="form_responses"
          />
        </Tabs.Panel>

        {!hideHistory && (
          <Tabs.Panel pt="md" value="history">
            <AuditTimeline entries={auditEntries} />
          </Tabs.Panel>
        )}
      </Tabs>
    </DetailShell>
  );
}
