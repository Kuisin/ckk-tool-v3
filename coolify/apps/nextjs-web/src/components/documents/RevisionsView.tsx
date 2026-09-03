"use client";

import { Badge, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { restoreRevision } from "@/app/(dashboard)/general/documents/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { useIsMobile } from "@/hooks/useViewport";
import type { RevisionRow } from "@/lib/internal-pages";
import { RevisionDiff } from "./RevisionDiff";

export function RevisionsView({
  pageNumber,
  pageTitle,
  revisions,
  bodies,
  canEdit,
}: {
  pageNumber: string;
  pageTitle: string;
  revisions: RevisionRow[];
  /** リビジョン番号 → 本文。差分はクライアントで取る。 */
  bodies: Record<string, string>;
  canEdit: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const ACTION_LABEL: Record<string, string> = {
    CREATE: tr("common.create2"),
    UPDATE: tr("common.edit"),
    PUBLISH: tr("documents.revisionsView.actionPublish"),
    RESTORE: tr("documents.revisionsView.restore2"),
    ARCHIVE: tr("common.archived2"),
  };

  const options = revisions.map((r) => ({
    value: String(r.revision),
    label: `r${r.revision}（${ACTION_LABEL[r.action] ?? r.action}）`,
  }));
  const latest = revisions[0]?.revision ?? 1;
  const previous = revisions[1]?.revision ?? latest;
  const [from, setFrom] = useState(String(previous));
  const [to, setTo] = useState(String(latest));

  const restore = (revision: number) =>
    openConfirm({
      title: tr("documents.revisionsView.restoreRevisionTitle", { revision }),
      message: tr("documents.revisionsView.thisCreatesANewRevisionWith"),
      confirmLabel: tr("documents.revisionsView.restore"),
      onConfirm: () =>
        startTransition(async () => {
          const r = await restoreRevision(pageNumber, revision);
          if (r.ok) {
            notifications.show({
              message: tr("documents.revisionsView.restoredAsRevision", {
                revision: r.data.revision,
              }),
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: r.error,
              color: "red",
            });
          }
        }),
    });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: tr("common.general") },
          { label: tr("common.internalDocuments"), href: "/general/documents" },
          { label: pageTitle, href: `/general/documents/${pageNumber}` },
          { label: tr("common.historyAndDiff") },
        ]}
        title={tr("common.historyAndDiff")}
      />

      <AppTabs defaultValue="diff">
        <Tabs.List>
          <Tabs.Tab value="diff">{tr("documents.revisionsView.diff")}</Tabs.Tab>
          <Tabs.Tab value="list">
            {tr("documents.revisionsView.versionListWithCount", {
              count: revisions.length,
            })}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="diff">
          <RevisionDiff
            from={from}
            fromBody={bodies[from] ?? ""}
            fromLabel={`r${from}`}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
            revisions={options}
            to={to}
            toBody={bodies[to] ?? ""}
            toLabel={`r${to}`}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="list">
          <Stack gap="xs">
            {revisions.map((r) => (
              <Paper key={r.revision} p="sm" radius="sm" withBorder>
                <Group
                  justify="space-between"
                  wrap={isMobile ? "wrap" : "nowrap"}
                >
                  <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
                    <Badge color="gray" variant="light">
                      r{r.revision}
                    </Badge>
                    <Badge color="blue" size="xs" variant="light">
                      {ACTION_LABEL[r.action] ?? r.action}
                    </Badge>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={500} size="sm" truncate>
                        {r.note || r.title}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {r.editedBy ?? tr("common.system")} ·{" "}
                        {fmt.dateTime(r.editedAt)}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap="sm" style={{ flexShrink: 0 }}>
                    <Text c="green" className="tabular-nums" size="xs">
                      +{r.addedLines}
                    </Text>
                    <Text c="red" className="tabular-nums" size="xs">
                      -{r.removedLines}
                    </Text>
                    {canEdit && r.revision !== latest && (
                      <GhostButton
                        loading={isPending}
                        onClick={() => restore(r.revision)}
                      >
                        {tr("documents.revisionsView.restore2")}
                      </GhostButton>
                    )}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
      </AppTabs>
    </Stack>
  );
}
