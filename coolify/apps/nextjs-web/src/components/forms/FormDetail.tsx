"use client";

import { Alert, Badge, CopyButton, Group, Tabs, Text } from "@mantine/core";
import { IconCheck, IconCopy, IconLink } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton } from "@/components/ui/buttons";
import { DataTable } from "@/components/ui/DataTable";
import { FieldValue } from "@/components/ui/FieldValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { AVAILABILITY_LABEL } from "@/lib/form-schema";
import type { FormDetailView, ResponseRow } from "@/lib/forms";
import type { ShareGrantView } from "@/lib/share-grants";
import type { ShareLevel } from "@/lib/share-grants-core";
import { type RoleOption, ShareGrantsPanel } from "./ShareGrantsPanel";

const FORM_SHARE_LEVELS: ShareLevel[] = ["RESPOND", "READ", "EDIT", "MANAGE"];

export function FormDetail({
  form,
  responses,
  grants,
  roleOptions,
  auditEntries,
  canEdit,
  canManage,
  onSaveShare,
}: {
  form: FormDetailView;
  responses: ResponseRow[];
  grants: ShareGrantView[];
  roleOptions: RoleOption[];
  auditEntries: AuditEntry[];
  canEdit: boolean;
  canManage: boolean;
  onSaveShare: (
    grants: { subjectType: string; subjectId: string | null; level: string }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/f/${form.code}`
      : `/f/${form.code}`;

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "回答画面を開く",
              icon: <IconLink size={14} />,
              onClick: () => router.push(`/f/${form.code}`),
            },
          ]}
          onEdit={
            canEdit
              ? () => router.push(`/general/forms/${form.code}/edit`)
              : undefined
          }
        />
      }
      breadcrumbs={[
        { label: "一般" },
        { label: "フォーム", href: "/general/forms" },
        { label: form.title },
      ]}
      createdAt={fmt.dateTime(form.createdAt)}
      status={<StatusBadge entity="Form" status={form.status} />}
      title={form.title}
      updatedAt={fmt.dateTime(form.updatedAt)}
    >
      {form.currentVersion === 0 && (
        <Alert color="yellow">
          まだ項目が公開されていません。「編集」から項目を組んで公開してください。
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label="種類"
          value={form.kind === "REQUEST" ? "申請・報告" : "アンケート"}
        />
        <FieldValue
          label="受付"
          value={
            <Badge
              color={form.availability === "OPEN" ? "green" : "gray"}
              variant="light"
            >
              {AVAILABILITY_LABEL[form.availability]}
            </Badge>
          }
        />
        <FieldValue label="定義バージョン" value={`v${form.currentVersion}`} />
        <FieldValue
          label="受付開始"
          value={form.opensAt ? fmt.dateTime(form.opensAt) : "公開時から"}
        />
        <FieldValue
          label="受付終了"
          value={form.closesAt ? fmt.dateTime(form.closesAt) : "無期限"}
        />
        <FieldValue
          label="回答者の表示"
          value={
            form.respondentVisibility === "HIDDEN"
              ? "表示しない（匿名で集計）"
              : "表示する"
          }
        />
        <FieldValue
          fullWidth
          label="共有 URL"
          value={
            <Group gap="xs" wrap={isMobile ? "wrap" : "nowrap"}>
              <Text
                ff="mono"
                size="sm"
                style={{ wordBreak: "break-all", minWidth: 0 }}
              >
                {shareUrl}
              </Text>
              <CopyButton value={shareUrl}>
                {({ copied, copy }) => (
                  <GhostButton
                    leftSection={
                      copied ? <IconCheck size={14} /> : <IconCopy size={14} />
                    }
                    onClick={copy}
                  >
                    {copied ? "コピーしました" : "コピー"}
                  </GhostButton>
                )}
              </CopyButton>
              <GhostButton
                leftSection={<IconLink size={14} />}
                onClick={() => router.push(`/f/${form.code}`)}
              >
                回答画面を開く
              </GhostButton>
            </Group>
          }
        />
        {form.description && (
          <FieldValue fullWidth label="説明" value={form.description} />
        )}
      </SummaryGrid>

      <Tabs defaultValue="responses">
        <Tabs.List>
          <Tabs.Tab value="responses">回答（{responses.length}）</Tabs.Tab>
          <Tabs.Tab value="share">共有</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="responses">
          <DataTable
            columns={[
              {
                key: "recordNo",
                header: "No.",
                width: 80,
                align: "right",
                sortValue: (r) => r.recordNo,
                render: (r) => r.recordNo,
              },
              {
                key: "responseNumber",
                header: "回答番号",
                width: 180,
                render: (r) => (
                  <Text ff="mono" size="xs">
                    {r.responseNumber}
                  </Text>
                ),
              },
              // 回答者を出すのは respondentVisibility=SHOWN のときだけ。
              // サーバが null にしているので、ここは列ごと落とす。
              ...(form.respondentVisibility === "SHOWN"
                ? [
                    {
                      key: "respondent",
                      header: "回答者",
                      width: 140,
                      render: (r: ResponseRow) => r.respondent ?? "—",
                    },
                  ]
                : []),
              {
                key: "status",
                header: "状態",
                width: 110,
                render: (r) => (
                  <StatusBadge entity="FormResponse" status={r.status} />
                ),
              },
              {
                key: "summary",
                header: "内容",
                render: (r) => (
                  <Text lineClamp={1} size="sm">
                    {r.summary || "—"}
                  </Text>
                ),
              },
              {
                key: "submittedAt",
                header: "提出日時",
                width: 150,
                render: (r) =>
                  r.submittedAt ? fmt.dateTime(r.submittedAt) : "—",
              },
            ]}
            data={responses}
            emptyMessage="まだ回答がありません"
            getRowId={(r) => r.responseNumber}
            onRowClick={(r) =>
              router.push(
                `/general/forms/${form.code}/responses/${r.responseNumber}`,
              )
            }
          />
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="share">
          <ShareGrantsPanel
            canManage={canManage}
            grants={grants}
            levels={FORM_SHARE_LEVELS}
            onSave={
              onSaveShare as unknown as React.ComponentProps<
                typeof ShareGrantsPanel
              >["onSave"]
            }
            roleOptions={roleOptions}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <AuditTimeline entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>
    </DetailShell>
  );
}
