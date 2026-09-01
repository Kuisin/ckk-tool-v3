"use client";

import {
  Alert,
  Anchor,
  Badge,
  CopyButton,
  Group,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArchive,
  IconArrowBackUp,
  IconChartBar,
  IconCheck,
  IconCopy,
  IconDownload,
  IconLink,
  IconTableExport,
  IconWorld,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { DataTable } from "@/components/ui/DataTable";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { openConfirm } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  type MenuItemDef,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { AVAILABILITY_LABEL } from "@/lib/form-schema";
import type { FormDetailView, ResponseRow } from "@/lib/forms";
import { keepInAppOnClick } from "@/lib/pwa-display";
import type { ShareGrantView } from "@/lib/share-grants";
import type { ShareLevel } from "@/lib/share-grants-core";
import { isShareConditionFieldType } from "@/lib/share-grants-core";
import { FormApprovalPanel, type FormFlowStep } from "./FormApprovalPanel";
import { FormFieldsPanel } from "./FormFieldsPanel";
import { ResponseExportModal } from "./ResponseExportModal";
import type { ConditionFieldOption } from "./ShareConditionEditor";
import { type RoleOption, ShareGrantsPanel } from "./ShareGrantsPanel";
import { ShareGrantsView } from "./ShareGrantsView";

/**
 * 共有条件に使える項目だけを取り出す。選んで入れる項目に限る理由は
 * ShareConditionEditor 側のコメントを参照。
 */
function conditionFieldsOf(
  fields: FormDetailView["fields"],
): ConditionFieldOption[] {
  return fields
    .filter((f) => isShareConditionFieldType(f.type))
    .map((f) => ({
      key: f.key,
      label: f.label.ja || f.key,
      type: f.type as ConditionFieldOption["type"],
      options: f.options?.map((o) => ({
        value: o.value,
        label: o.label.ja || o.value,
      })),
      lookupSource: f.lookup?.source,
    }));
}

const FORM_SHARE_LEVELS: ShareLevel[] = ["RESPOND", "READ", "EDIT", "MANAGE"];

export function FormDetail({
  form,
  responses,
  grants,
  roleOptions,
  auditEntries,
  canEdit,
  canManage,
  approval,
  onSaveShare,
  onSetStatus,
}: {
  form: FormDetailView;
  responses: ResponseRow[];
  grants: ShareGrantView[];
  roleOptions: RoleOption[];
  auditEntries: AuditEntry[];
  canEdit: boolean;
  canManage: boolean;
  /** 承認タブの中身（申請・報告フォームのときだけサーバが渡す）。 */
  approval: {
    steps: FormFlowStep[];
    groupOptions: { value: string; label: string }[];
    approversByGroup: Record<string, FlowApprover[]>;
    permissionLabel: string;
  } | null;
  onSaveShare: (
    grants: { subjectType: string; subjectId: string | null; level: string }[],
  ) => Promise<{ ok: boolean; error?: string }>;
  onSetStatus: (
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const tr = useTr();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/f/${form.code}`
      : `/f/${form.code}`;

  const [pending, startTransition] = useTransition();
  const [exportOpen, setExportOpen] = useState(false);

  const applyStatus = (
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
    done: string,
  ) => {
    startTransition(async () => {
      const result = await onSetStatus(status);
      notifications.show(
        result.ok
          ? { title: done, message: form.title, color: "green" }
          : {
              title: tr("変更できませんでした"),
              message: result.error
                ? tr(result.error)
                : tr("もう一度お試しください"),
              color: "red",
            },
      );
      if (result.ok) router.refresh();
    });
  };

  // 公開状態の操作。**押せないときも隠さずグレーアウトで残す** — 「公開する」が
  // 見当たらないのと、押せない理由が書いてあるのとでは、迷い方がまるで違う。
  const statusItems: MenuItemDef[] = canEdit
    ? [
        ...(form.status === "PUBLISHED"
          ? []
          : [
              {
                label: tr("公開する"),
                icon: <IconWorld size={14} />,
                disabled: pending || form.currentVersion === 0,
                disabledReason:
                  form.currentVersion === 0
                    ? tr("先に「編集」から項目を追加して保存してください")
                    : undefined,
                onClick: () => applyStatus("PUBLISHED", tr("公開しました")),
              },
            ]),
        ...(form.status === "PUBLISHED"
          ? [
              {
                label: tr("下書きに戻す"),
                icon: <IconArrowBackUp size={14} />,
                disabled: pending,
                onClick: () =>
                  openConfirm({
                    title: tr("下書きに戻す"),
                    message: tr(
                      tr(
                        tr(
                          "受付を止めます。共有 URL を開いても回答できなくなります（今ある回答は残ります）。",
                        ),
                      ),
                    ),
                    confirmLabel: tr("下書きに戻す"),
                    onConfirm: () =>
                      applyStatus("DRAFT", tr("下書きに戻しました")),
                  }),
              },
            ]
          : []),
        ...(form.status === "ARCHIVED"
          ? []
          : [
              {
                label: tr("アーカイブする"),
                icon: <IconArchive size={14} />,
                color: "red",
                disabled: pending,
                divider: true,
                onClick: () =>
                  openConfirm({
                    title: tr("アーカイブする"),
                    message: tr(
                      tr(
                        tr(
                          "使い終わったフォームとして片付けます。受付は止まりますが、回答と集計は残ります。",
                        ),
                      ),
                    ),
                    confirmLabel: tr("アーカイブする"),
                    onConfirm: () =>
                      applyStatus("ARCHIVED", tr("アーカイブしました")),
                  }),
              },
            ]),
      ]
    : [];

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...statusItems,
            {
              label: tr("回答を集計する"),
              icon: <IconChartBar size={14} />,
              onClick: () => router.push(`/general/forms/${form.code}/summary`),
            },
            {
              // 回答画面は「配る先が見るもの」なので、編集中の画面を
              // 置き換えずに別タブで開く（PWA ではアプリ内で開く）。
              label: tr("回答画面を開く"),
              icon: <IconLink size={14} />,
              href: `/f/${form.code}`,
            },
            {
              // 別環境へ持っていくための書き出し。実ファイルの
              // ダウンロードなので href（Route Handler）で開く。
              label: tr("定義を書き出す（.txt）"),
              icon: <IconDownload size={14} />,
              href: `/api/forms/${form.code}/export`,
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
        { label: tr("一般") },
        { label: tr("フォーム"), href: "/general/forms" },
        { label: form.title },
      ]}
      createdAt={fmt.dateTime(form.createdAt)}
      status={<StatusBadge entity="Form" status={form.status} />}
      title={form.title}
      updatedAt={fmt.dateTime(form.updatedAt)}
    >
      {form.currentVersion === 0 && (
        <Alert color="yellow">
          {tr(
            tr(
              tr(
                "まだ項目が公開されていません。「編集」から項目を組んで公開してください。",
              ),
            ),
          )}
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label={tr("種類")}
          value={form.kind === "REQUEST" ? "申請・報告" : tr("アンケート")}
        />
        <FieldValue
          label={tr("受付")}
          value={
            <Badge
              color={form.availability === "OPEN" ? "green" : "gray"}
              variant="light"
            >
              {AVAILABILITY_LABEL[form.availability]}
            </Badge>
          }
        />
        <FieldValue
          label={tr("定義バージョン")}
          value={`v${form.currentVersion}`}
        />
        {/* 集計を Metabase で見るときに貼る値。集計画面にも同じものを出している。 */}
        <FieldValue
          label={tr("フォームコード")}
          value={<CopyableValue value={form.code} />}
        />
        <FieldValue
          label={tr("受付開始")}
          value={form.opensAt ? fmt.dateTime(form.opensAt) : tr("公開時から")}
        />
        <FieldValue
          label={tr("受付終了")}
          value={form.closesAt ? fmt.dateTime(form.closesAt) : tr("無期限")}
        />
        <FieldValue
          label={tr("回答者の表示")}
          value={
            form.respondentVisibility === "HIDDEN"
              ? tr("表示しない（匿名で集計）")
              : tr("表示する")
          }
        />
        <FieldValue
          fullWidth
          label={tr("共有 URL")}
          value={
            <Group gap="xs" wrap={isMobile ? "wrap" : "nowrap"}>
              {/* URL そのものも踏めるようにする（コピーして貼り直す手間を省く）。
                  別タブで開き、PWA ではアプリ内に留める。 */}
              <Anchor
                ff="mono"
                href={`/f/${form.code}`}
                onClick={(e) => keepInAppOnClick(e, `/f/${form.code}`)}
                rel="noopener noreferrer"
                size="sm"
                style={{ wordBreak: "break-all", minWidth: 0 }}
                target="_blank"
              >
                {shareUrl}
              </Anchor>
              <CopyButton value={shareUrl}>
                {({ copied, copy }) => (
                  <GhostButton
                    leftSection={
                      copied ? <IconCheck size={14} /> : <IconCopy size={14} />
                    }
                    onClick={copy}
                  >
                    {copied ? "コピーしました" : tr("コピー")}
                  </GhostButton>
                )}
              </CopyButton>
              <GhostButton
                external
                // 回答画面はアプリの画面（自前のナビゲーションを持つ）なので、
                // PWA ではアプリの中で開く（lib/pwa-display.ts）。
                href={`/f/${form.code}`}
                keepInApp
                leftSection={<IconLink size={14} />}
              >
                {tr("回答画面を開く")}
              </GhostButton>
            </Group>
          }
        />
        {form.description && (
          <FieldValue fullWidth label={tr("説明")} value={form.description} />
        )}
      </SummaryGrid>

      <AppTabs defaultValue="fields">
        <Tabs.List>
          <Tabs.Tab value="fields">項目（{form.fields.length}）</Tabs.Tab>
          <Tabs.Tab value="responses">回答（{responses.length}）</Tabs.Tab>
          {approval && <Tabs.Tab value="approval">承認</Tabs.Tab>}
          <Tabs.Tab value="share">{tr("共有")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="fields">
          <FormFieldsPanel
            currentVersion={form.currentVersion}
            fields={form.fields}
            schemaError={form.schemaError}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="responses">
          {responses.length > 0 && (
            <Group justify={isMobile ? "stretch" : "flex-end"} mb="sm">
              <GhostButton
                fullWidth={isMobile}
                leftSection={<IconChartBar size={14} />}
                onClick={() =>
                  router.push(`/general/forms/${form.code}/summary`)
                }
              >
                {tr("集計を見る")}
              </GhostButton>
              <GhostButton
                fullWidth={isMobile}
                leftSection={<IconTableExport size={14} />}
                onClick={() => setExportOpen(true)}
              >
                {tr("書き出す")}
              </GhostButton>
            </Group>
          )}
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
                header: tr("回答番号"),
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
                      header: tr("回答者"),
                      width: 140,
                      render: (r: ResponseRow) => r.respondent ?? "—",
                    },
                  ]
                : []),
              {
                key: "status",
                header: tr("状態"),
                width: 110,
                render: (r) => (
                  <StatusBadge entity="FormResponse" status={r.status} />
                ),
              },
              {
                key: "summary",
                header: tr("内容"),
                render: (r) => (
                  <Text lineClamp={1} size="sm">
                    {r.summary || "—"}
                  </Text>
                ),
              },
              {
                key: "submittedAt",
                header: tr("提出日時"),
                width: 150,
                render: (r) =>
                  r.submittedAt ? fmt.dateTime(r.submittedAt) : "—",
              },
            ]}
            data={responses}
            emptyMessage={tr("まだ回答がありません")}
            getRowId={(r) => r.responseNumber}
            onRowClick={(r) =>
              router.push(
                `/general/forms/${form.code}/responses/${r.responseNumber}`,
              )
            }
            renderCard={(r) => (
              <Stack gap={4}>
                <Group gap="xs" justify="space-between" wrap="nowrap">
                  <Text fw={600} size="sm">
                    No. {r.recordNo}
                  </Text>
                  <StatusBadge entity="FormResponse" status={r.status} />
                </Group>
                <Text c="dimmed" ff="mono" size="xs">
                  {r.responseNumber}
                </Text>
                {/* 回答者は「表示する」フォームだけ。列と同じ条件をここにも置く
                    — サーバは既に null にしているが、条件を 1 か所に頼らない。 */}
                {form.respondentVisibility === "SHOWN" && r.respondent && (
                  <Text c="dimmed" size="xs">
                    回答者 {r.respondent}
                  </Text>
                )}
                <Text lineClamp={2} size="sm">
                  {r.summary || "—"}
                </Text>
                <Text c="dimmed" size="xs">
                  {r.submittedAt ? fmt.dateTime(r.submittedAt) : tr("未提出")}
                </Text>
              </Stack>
            )}
          />
        </Tabs.Panel>

        {approval && (
          <Tabs.Panel keepMounted={false} pt="md" value="approval">
            <FormApprovalPanel
              approvalEnabled={form.approvalEnabled}
              approversByGroup={approval.approversByGroup}
              canManage={canManage}
              code={form.code}
              editableUntilFirstApproval={form.editableUntilFirstApproval}
              groupOptions={approval.groupOptions}
              initialSteps={approval.steps}
              permissionLabel={approval.permissionLabel}
              title={form.title}
            />
          </Tabs.Panel>
        )}

        <Tabs.Panel keepMounted={false} pt="md" value="share">
          <EditablePanel
            canEdit={canManage}
            edit={({ close }) => (
              <ShareGrantsPanel
                canManage={canManage}
                conditionFields={conditionFieldsOf(form.fields)}
                grants={grants}
                levels={FORM_SHARE_LEVELS}
                // 完了通知はアンケートには無い概念（完了する対象が無い）。
                onCancel={close}
                onSave={
                  onSaveShare as unknown as React.ComponentProps<
                    typeof ShareGrantsPanel
                  >["onSave"]
                }
                onSaved={close}
                roleOptions={roleOptions}
                showNotifyOnComplete={form.kind === "REQUEST"}
              />
            )}
            title={tr("共有先")}
            view={
              <ShareGrantsView
                conditionFields={conditionFieldsOf(form.fields)}
                grants={grants}
              />
            }
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <AuditTimeline entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ResponseExportModal
        code={form.code}
        fields={form.fields.filter((f) => f.type !== "related")}
        formTitle={form.title}
        onClose={() => setExportOpen(false)}
        opened={exportOpen}
        responseCount={responses.length}
      />
    </DetailShell>
  );
}
