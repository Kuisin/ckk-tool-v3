"use client";

import { Alert, Stack, Tabs, Text } from "@mantine/core";
import {
  approveResponse,
  rejectResponse,
  requestResponseApproval,
} from "@/app/(dashboard)/general/forms/actions";
import type { ApprovalTrailView } from "@/components/approvals/ApprovalTrailList";
import { ApprovalTrailList } from "@/components/approvals/ApprovalTrailList";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { AttachmentsPanel } from "@/components/ui/AttachmentsPanel";
import { EditButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  SummaryGrid,
} from "@/components/ui/shells";
import type { MemoView } from "@/lib/document-memos";
import type { FormAnswerValue, FormFieldDef } from "@/lib/form-schema";
import { FormResponseView, type RelatedTable } from "./FormResponseView";
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
        canEdit ? (
          <EditButton
            href={`/f/${formCode}/${encodeURIComponent(responseNumber)}/edit`}
          />
        ) : undefined
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
          isOwner={isOwner}
          onApprove={async (n) => {
            const r = await approveResponse(n);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
          onReject={async (n, reason) => {
            const r = await rejectResponse(n, reason);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
          onRequest={async (n) => {
            const r = await requestResponseApproval(n);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
          rejectReason={rejectReason}
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
          {rejectReason}
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
          <Stack gap="md">
            <FormResponseView
              answers={answers}
              fields={fields}
              related={related}
            />
          </Stack>
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
