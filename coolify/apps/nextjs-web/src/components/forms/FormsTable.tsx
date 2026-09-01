"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconFileImport, IconForms } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { AVAILABILITY_LABEL, type FormAvailability } from "@/lib/form-schema";
import type { FormRow } from "@/lib/forms";

const AVAILABILITY_COLOR: Record<FormAvailability, string> = {
  DRAFT: "gray",
  SCHEDULED: "yellow",
  OPEN: "green",
  CLOSED: "dark",
  ARCHIVED: "gray",
};

export function FormsTable({
  rows,
  canCreate,
}: {
  rows: FormRow[];
  canCreate: boolean;
}) {
  const tr = useTr();
  const router = useRouter();
  const fmt = useFormat();

  return (
    <ListShell
      action={
        canCreate ? (
          <Group gap="xs" wrap="nowrap">
            <SecondaryButton
              href="/general/forms/import"
              leftSection={<IconFileImport size={14} />}
            >
              {tr("取り込み")}
            </SecondaryButton>
            <NewButton href="/general/forms/new" />
          </Group>
        ) : undefined
      }
      breadcrumbs={[{ label: tr("一般") }, { label: tr("フォーム") }]}
      title={tr("フォーム")}
    >
      <DataTable
        columns={[
          {
            key: "title",
            header: tr("タイトル"),
            render: (r) => (
              <Stack gap={2}>
                <Text fw={500} size="sm">
                  {r.title}
                </Text>
                <Text c="dimmed" ff="mono" size="xs">
                  /f/{r.code}
                </Text>
              </Stack>
            ),
          },
          {
            key: "kind",
            header: tr("種類"),
            width: 120,
            render: (r) => (
              <Badge
                color={r.kind === "REQUEST" ? "indigo" : "cyan"}
                variant="light"
              >
                {r.kind === "REQUEST" ? "申請・報告" : tr("アンケート")}
              </Badge>
            ),
          },
          {
            key: "availability",
            header: tr("受付"),
            width: 110,
            render: (r) => (
              <Badge color={AVAILABILITY_COLOR[r.availability]} variant="light">
                {AVAILABILITY_LABEL[r.availability]}
              </Badge>
            ),
          },
          {
            key: "status",
            header: tr("状態"),
            width: 110,
            render: (r) => <StatusBadge entity="Form" status={r.status} />,
          },
          {
            key: "responseCount",
            header: tr("回答数"),
            width: 90,
            align: "right",
            sortValue: (r) => r.responseCount,
            render: (r) => r.responseCount,
          },
          {
            key: "closesAt",
            header: tr("受付終了"),
            width: 120,
            render: (r) => (r.closesAt ? fmt.date(r.closesAt) : "—"),
          },
          {
            key: "updatedAt",
            header: tr("更新日"),
            width: 120,
            render: (r) => fmt.date(r.updatedAt),
          },
        ]}
        data={rows}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyIcon={<IconForms size={28} />}
        emptyMessage={tr("表示できるフォームがありません")}
        getRowId={(r) => r.code}
        onRowClick={(r) => router.push(`/general/forms/${r.code}`)}
        renderCard={(r) => (
          <Stack gap={4}>
            <Group gap="xs" justify="space-between">
              <Text fw={600} size="sm">
                {r.title}
              </Text>
              <Badge color={AVAILABILITY_COLOR[r.availability]} variant="light">
                {AVAILABILITY_LABEL[r.availability]}
              </Badge>
            </Group>
            <Text c="dimmed" size="xs">
              回答 {r.responseCount} 件 / 更新 {fmt.date(r.updatedAt)}
            </Text>
          </Stack>
        )}
        urlState
      />
    </ListShell>
  );
}
