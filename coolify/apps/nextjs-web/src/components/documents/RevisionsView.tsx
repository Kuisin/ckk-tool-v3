"use client";

import { Badge, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
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

const ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "編集",
  PUBLISH: "公開",
  RESTORE: "復元",
  ARCHIVE: "アーカイブ",
};

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
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

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
      title: `リビジョン ${revision} を復元`,
      message:
        "この内容で新しいリビジョンを作ります。履歴は巻き戻さず、前に進めて元に戻します。",
      confirmLabel: "復元する",
      onConfirm: () =>
        startTransition(async () => {
          const r = await restoreRevision(pageNumber, revision);
          if (r.ok) {
            notifications.show({
              message: `リビジョン ${r.data.revision} として復元しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
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
          { label: "一般" },
          { label: "社内文書", href: "/general/documents" },
          { label: pageTitle, href: `/general/documents/${pageNumber}` },
          { label: "履歴・差分" },
        ]}
        title="履歴・差分"
      />

      <AppTabs defaultValue="diff">
        <Tabs.List>
          <Tabs.Tab value="diff">差分</Tabs.Tab>
          <Tabs.Tab value="list">版一覧（{revisions.length}）</Tabs.Tab>
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
                        {r.editedBy ?? "システム"} · {fmt.dateTime(r.editedAt)}
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
                        復元
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
