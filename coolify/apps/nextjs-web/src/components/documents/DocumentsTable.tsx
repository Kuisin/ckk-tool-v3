"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import type { PageRow } from "@/lib/internal-pages";

export function DocumentsTable({
  rows,
  canCreate,
}: {
  rows: PageRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const fmt = useFormat();

  return (
    <ListShell
      action={
        canCreate ? (
          <NewButton href="/general/documents/new" label="文書を作る" />
        ) : undefined
      }
      breadcrumbs={[{ label: "一般" }, { label: "社内文書" }]}
      title="社内文書"
    >
      <DataTable
        columns={[
          {
            key: "title",
            header: "タイトル",
            render: (r) => (
              <Stack gap={2}>
                <Text fw={500} size="sm">
                  {r.title}
                </Text>
                <Group gap="xs">
                  <Text c="dimmed" ff="mono" size="xs">
                    {r.pageNumber}
                  </Text>
                  {r.folder && (
                    <Badge color="gray" size="xs" variant="light">
                      {r.folder}
                    </Badge>
                  )}
                </Group>
              </Stack>
            ),
          },
          {
            key: "status",
            header: "状態",
            width: 120,
            render: (r) => (
              <StatusBadge entity="InternalPage" status={r.status} />
            ),
          },
          {
            key: "publishedRevision",
            header: "公開版",
            width: 90,
            align: "right",
            render: (r) =>
              r.publishedRevision ? `r${r.publishedRevision}` : "—",
          },
          {
            key: "openComments",
            header: "未解決",
            width: 90,
            align: "right",
            sortValue: (r) => r.openComments,
            render: (r) =>
              r.openComments > 0 ? (
                <Badge color="blue" variant="light">
                  {r.openComments}
                </Badge>
              ) : (
                "—"
              ),
          },
          {
            key: "updatedAt",
            header: "更新日",
            width: 120,
            render: (r) => fmt.date(r.updatedAt),
          },
        ]}
        data={rows}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyIcon={<IconFileDescription size={28} />}
        emptyMessage="表示できる文書がありません"
        getRowId={(r) => r.pageNumber}
        onRowClick={(r) => router.push(`/general/documents/${r.pageNumber}`)}
        renderCard={(r) => (
          <Stack gap={4}>
            <Group gap="xs" justify="space-between">
              <Text fw={600} size="sm">
                {r.title}
              </Text>
              <StatusBadge entity="InternalPage" status={r.status} />
            </Group>
            <Text c="dimmed" size="xs">
              {r.folder ? `${r.folder} / ` : ""}
              更新 {fmt.date(r.updatedAt)}
            </Text>
          </Stack>
        )}
        urlState
      />
    </ListShell>
  );
}
