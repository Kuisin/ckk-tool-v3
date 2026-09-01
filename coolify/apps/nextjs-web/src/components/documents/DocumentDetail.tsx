"use client";

/**
 * DocumentDetail — 公開版の閲覧。
 *
 * **行コメントはここに出さない。** ページ側でも取得していない（レビュー画面
 * だけが読む）。「レビューに出し、公開には出さない」をこの境界で担保する。
 */

import { Alert, Badge, Group, Tabs } from "@mantine/core";
import { IconEye, IconGitCompare, IconMessage } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type RoleOption,
  ShareGrantsPanel,
} from "@/components/forms/ShareGrantsPanel";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { FieldValue } from "@/components/ui/FieldValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import type { PageDetailView } from "@/lib/internal-pages";
import type { ShareGrantView } from "@/lib/share-grants";
import type { ShareLevel } from "@/lib/share-grants-core";
import { type LinkTargets, MarkdownView } from "./MarkdownView";
import { PagePublishCard } from "./PagePublishCard";

// 文書には「回答」が無いので RESPOND は出さない。
const PAGE_SHARE_LEVELS: ShareLevel[] = ["READ", "EDIT", "MANAGE"];

export function DocumentDetail({
  page,
  links,
  grants,
  roleOptions,
  auditEntries,
  canEdit,
  canManage,
  canApprove,
  openComments,
  onSaveShare,
}: {
  page: PageDetailView;
  links: LinkTargets;
  grants: ShareGrantView[];
  roleOptions: RoleOption[];
  auditEntries: AuditEntry[];
  canEdit: boolean;
  canManage: boolean;
  canApprove: boolean;
  openComments: number;
  onSaveShare: (
    grants: { subjectType: string; subjectId: string | null; level: string }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const hasUnpublished =
    page.latestRevision > 0 && page.publishedRevision !== page.latestRevision;

  return (
    <DetailShell
      actions={
        // スマホでは 3 つ並べず ... メニューに畳む（design.md §20.2）。
        <ResourceActions
          menuItems={[
            {
              label: tr("common.review"),
              icon: <IconMessage size={14} />,
              onClick: () =>
                router.push(`/general/documents/${page.pageNumber}/review`),
            },
            {
              label: tr("common.historyAndDiff"),
              icon: <IconGitCompare size={14} />,
              onClick: () =>
                router.push(`/general/documents/${page.pageNumber}/revisions`),
            },
          ]}
          onEdit={
            canEdit
              ? () => router.push(`/general/documents/${page.pageNumber}/edit`)
              : undefined
          }
        />
      }
      breadcrumbs={[
        { label: tr("common.general") },
        { label: tr("common.internalDocuments"), href: "/general/documents" },
        { label: page.title },
      ]}
      createdAt={fmt.dateTime(page.createdAt)}
      status={<StatusBadge entity="InternalPage" status={page.status} />}
      title={page.title}
      updatedAt={fmt.dateTime(page.updatedAt)}
    >
      <PagePublishCard
        approvalRequired={page.approvalRequired}
        canApprove={canApprove}
        canEdit={canEdit}
        hasUnpublishedChanges={hasUnpublished}
        openComments={openComments}
        pageNumber={page.pageNumber}
        status={page.status}
      />

      <SummaryGrid>
        <FieldValue
          label={tr("common.documentNumber2")}
          value={page.pageNumber}
        />
        <FieldValue label={tr("common.folder")} value={page.folder ?? "—"} />
        <FieldValue
          label={tr("common.publishedVersion")}
          value={
            page.publishedRevision ? (
              <Group gap="xs">
                <Badge color="green" variant="light">
                  r{page.publishedRevision}
                </Badge>
                {hasUnpublished && (
                  <Badge color="yellow" variant="light">
                    {tr(
                      "documents.documentDetail.hasUnpublishedChangesRevision",
                      { revision: page.latestRevision },
                    )}
                  </Badge>
                )}
              </Group>
            ) : (
              tr("documents.documentDetail.unpublished")
            )
          }
        />
        <FieldValue
          label={tr("documents.documentDetail.approvalToPublish")}
          value={
            page.approvalRequired
              ? tr("documents.documentDetail.required")
              : tr("documents.documentDetail.notRequired")
          }
        />
        {page.summary && (
          <FieldValue
            fullWidth
            label={tr("common.overview")}
            value={page.summary}
          />
        )}
      </SummaryGrid>

      <AppTabs defaultValue="body">
        <Tabs.List>
          <Tabs.Tab leftSection={<IconEye size={14} />} value="body">
            {tr("documents.documentDetail.bodyText")}
          </Tabs.Tab>
          <Tabs.Tab value="share">{tr("common.sharing")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="body">
          {page.publishedBody == null ? (
            <Alert color="yellow">
              {tr("documents.documentDetail.itIsNotPublishedYetEdit")}
            </Alert>
          ) : (
            <MarkdownView body={page.publishedBody} links={links} />
          )}
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="share">
          <ShareGrantsPanel
            canManage={canManage}
            grants={grants}
            levels={PAGE_SHARE_LEVELS}
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
      </AppTabs>
    </DetailShell>
  );
}
