"use client";

import {
  Alert,
  Anchor,
  Badge,
  CopyButton,
  Group,
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
  IconWorld,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton } from "@/components/ui/buttons";
import { DataTable } from "@/components/ui/DataTable";
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
import { useIsMobile } from "@/hooks/useViewport";
import { AVAILABILITY_LABEL } from "@/lib/form-schema";
import type { FormDetailView, ResponseRow } from "@/lib/forms";
import { keepInAppOnClick } from "@/lib/pwa-display";
import type { ShareGrantView } from "@/lib/share-grants";
import type { ShareLevel } from "@/lib/share-grants-core";
import { isShareConditionFieldType } from "@/lib/share-grants-core";
import { FormFieldsPanel } from "./FormFieldsPanel";
import type { ConditionFieldOption } from "./ShareConditionEditor";
import { type RoleOption, ShareGrantsPanel } from "./ShareGrantsPanel";

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
  onSaveShare: (
    grants: { subjectType: string; subjectId: string | null; level: string }[],
  ) => Promise<{ ok: boolean; error?: string }>;
  onSetStatus: (
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/f/${form.code}`
      : `/f/${form.code}`;

  const [pending, startTransition] = useTransition();

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
              title: "変更できませんでした",
              message: result.error ?? "もう一度お試しください",
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
                label: "公開する",
                icon: <IconWorld size={14} />,
                disabled: pending || form.currentVersion === 0,
                disabledReason:
                  form.currentVersion === 0
                    ? "先に「編集」から項目を追加して保存してください"
                    : undefined,
                onClick: () => applyStatus("PUBLISHED", "公開しました"),
              },
            ]),
        ...(form.status === "PUBLISHED"
          ? [
              {
                label: "下書きに戻す",
                icon: <IconArrowBackUp size={14} />,
                disabled: pending,
                onClick: () =>
                  openConfirm({
                    title: "下書きに戻す",
                    message:
                      "受付を止めます。共有 URL を開いても回答できなくなります（今ある回答は残ります）。",
                    confirmLabel: "下書きに戻す",
                    onConfirm: () => applyStatus("DRAFT", "下書きに戻しました"),
                  }),
              },
            ]
          : []),
        ...(form.status === "ARCHIVED"
          ? []
          : [
              {
                label: "アーカイブする",
                icon: <IconArchive size={14} />,
                color: "red",
                disabled: pending,
                divider: true,
                onClick: () =>
                  openConfirm({
                    title: "アーカイブする",
                    message:
                      "使い終わったフォームとして片付けます。受付は止まりますが、回答と集計は残ります。",
                    confirmLabel: "アーカイブする",
                    onConfirm: () =>
                      applyStatus("ARCHIVED", "アーカイブしました"),
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
              label: "回答を集計する",
              icon: <IconChartBar size={14} />,
              onClick: () => router.push(`/general/forms/${form.code}/summary`),
            },
            {
              // 回答画面は「配る先が見るもの」なので、編集中の画面を
              // 置き換えずに別タブで開く（PWA ではアプリ内で開く）。
              label: "回答画面を開く",
              icon: <IconLink size={14} />,
              href: `/f/${form.code}`,
            },
            {
              // 別環境へ持っていくための書き出し。実ファイルの
              // ダウンロードなので href（Route Handler）で開く。
              label: "定義を書き出す（.txt）",
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
                    {copied ? "コピーしました" : "コピー"}
                  </GhostButton>
                )}
              </CopyButton>
              <GhostButton
                external
                href={`/f/${form.code}`}
                leftSection={<IconLink size={14} />}
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

      <Tabs defaultValue="fields">
        <Tabs.List>
          <Tabs.Tab value="fields">項目（{form.fields.length}）</Tabs.Tab>
          <Tabs.Tab value="responses">回答（{responses.length}）</Tabs.Tab>
          <Tabs.Tab value="share">共有</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
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
            <Group justify="flex-end" mb="sm">
              <GhostButton
                leftSection={<IconChartBar size={14} />}
                onClick={() =>
                  router.push(`/general/forms/${form.code}/summary`)
                }
              >
                集計を見る
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
            conditionFields={conditionFieldsOf(form.fields)}
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
