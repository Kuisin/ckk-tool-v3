"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconFileImport, IconForms } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { availabilityLabel, type FormAvailability } from "@/lib/form-schema";
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
  const tr = useTranslations();
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
              {tr("common.import")}
            </SecondaryButton>
            <NewButton href="/general/forms/new" />
          </Group>
        ) : undefined
      }
      breadcrumbs={[
        { label: tr("common.general") },
        { label: tr("common.forms") },
      ]}
      title={tr("common.forms")}
    >
      <DataTable
        columns={[
          {
            key: "title",
            header: tr("common.title"),
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
            header: tr("common.kind"),
            width: 120,
            render: (r) => (
              <Badge
                color={r.kind === "REQUEST" ? "indigo" : "cyan"}
                variant="light"
              >
                {r.kind === "REQUEST" ? "申請・報告" : tr("common.survey")}
              </Badge>
            ),
          },
          {
            key: "availability",
            header: tr("common.reception"),
            width: 110,
            render: (r) => (
              <Badge color={AVAILABILITY_COLOR[r.availability]} variant="light">
                {availabilityLabel(tr)[r.availability]}
              </Badge>
            ),
          },
          {
            key: "status",
            header: tr("common.status"),
            width: 110,
            render: (r) => <StatusBadge entity="Form" status={r.status} />,
          },
          {
            key: "responseCount",
            header: tr("common.responses"),
            width: 90,
            align: "right",
            sortValue: (r) => r.responseCount,
            render: (r) => r.responseCount,
          },
          {
            key: "closesAt",
            header: tr("common.closed"),
            width: 120,
            render: (r) => (r.closesAt ? fmt.date(r.closesAt) : "—"),
          },
          {
            key: "updatedAt",
            header: tr("common.updated"),
            width: 120,
            render: (r) => fmt.date(r.updatedAt),
          },
        ]}
        data={rows}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyIcon={<IconForms size={28} />}
        emptyMessage={tr("forms.formsTable.thereAreNoFormsToShow")}
        getRowId={(r) => r.code}
        onRowClick={(r) => router.push(`/general/forms/${r.code}`)}
        renderCard={(r) => (
          <Stack gap={4}>
            <Group gap="xs" justify="space-between">
              <Text fw={600} size="sm">
                {r.title}
              </Text>
              <Badge color={AVAILABILITY_COLOR[r.availability]} variant="light">
                {availabilityLabel(tr)[r.availability]}
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
