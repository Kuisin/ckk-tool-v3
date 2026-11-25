"use client";

/**
 * WorkLocationBoard — 作業場所一覧 (PD09)。
 *
 * 選んだ日（既定 = 今日・JST）に、作業場所ごとに何の工程が待っているかを
 * 並べる。共有端末の /work-location が 1 か所の機械の前で出すものを、事務所から
 * 全部の作業場所について一度に見る画面。行を押すと工程実行画面へ。
 *
 * 日付は URL（?date=）に持ち、サーバーが引き直す — 表示中の日はサーバーが
 * 返した値（data.date）が正で、URL を入力欄の値にはしない。
 */

import { Badge, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconMapPin } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { StepDueDateBadge } from "@/components/production/StepDueDateBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlPatcher } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { jstTodayString } from "@/lib/step-due-date-core";
import type { BoardRow } from "@/lib/work-location-board-core";
import type { BoardData } from "./model";

const WORK_ORDERS_PATH = "/production/work-orders";

export function WorkLocationBoard({ data }: { data: BoardData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const patch = useUrlPatcher("server");

  const setDate = (v: string | null) => {
    // 今日は URL から落とす（既定値を URL に残さない）
    patch({ date: v && v !== jstTodayString() ? v : null });
  };

  const timeText = (r: BoardRow) =>
    r.plannedStartAt
      ? `${fmt.time(r.plannedStartAt)}〜${r.plannedEndAt ? fmt.time(r.plannedEndAt) : ""}`
      : "—";

  const reasonBadge = (r: BoardRow) =>
    r.reason === "CARRIED_OVER" ? (
      <Badge color="red" size="xs" variant="light">
        {tr("production.workLocationBoard.carriedOver", {
          date: r.plannedDate ?? "",
        })}
      </Badge>
    ) : r.reason === "WORKING" ? (
      <Badge color="blue" size="xs" variant="light">
        {tr("production.workLocationBoard.working")}
      </Badge>
    ) : null;

  const columns: Column<BoardRow>[] = [
    {
      key: "time",
      header: tr("production.workLocationBoard.time"),
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {timeText(r)}
        </Text>
      ),
      sortValue: (r) => r.plannedStartAt ?? "~",
      width: 130,
    },
    {
      key: "workOrder",
      header: tr("production.workLocationBoard.workOrder"),
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.docNumber}
        </Text>
      ),
      sortValue: (r) => r.workOrderNumber,
      width: 170,
    },
    {
      key: "product",
      header: tr("production.workLocationBoard.product"),
      render: (r) => r.productName,
      sortValue: (r) => r.productName,
    },
    {
      key: "step",
      header: tr("production.workLocationBoard.step"),
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{r.stepName}</Text>
          {reasonBadge(r)}
        </Group>
      ),
      sortValue: (r) => r.stepName,
    },
    {
      key: "assignee",
      header: tr("production.workLocationBoard.assignee"),
      render: (r) => r.assigneeName ?? "—",
      sortValue: (r) => r.assigneeName ?? "",
      hideable: true,
    },
    {
      key: "dueDate",
      header: tr("production.stepDueDate.label"),
      render: (r) =>
        r.dueDate ? (
          <StepDueDateBadge
            dueDate={r.dueDate}
            size="xs"
            status={r.stepStatus}
          />
        ) : (
          "—"
        ),
      sortValue: (r) => r.dueDate ?? "~",
      hideable: true,
      width: 160,
    },
    {
      key: "status",
      header: tr("production.workLocationBoard.status"),
      render: (r) => <StatusBadge entity="Step" status={r.stepStatus} />,
      sortValue: (r) => r.stepStatus,
      width: 110,
    },
  ];

  const renderCard = (r: BoardRow) => (
    <Stack gap={3} style={{ minWidth: 0 }}>
      <Group justify="space-between" wrap="nowrap">
        <Text c="dimmed" ff="mono" size="xs">
          {r.docNumber}
        </Text>
        <StatusBadge entity="Step" status={r.stepStatus} />
      </Group>
      <Group gap={6} wrap="nowrap">
        <Text fw={600} size="sm" truncate>
          {r.stepName}
        </Text>
        {reasonBadge(r)}
      </Group>
      <Text c="dimmed" size="xs" truncate>
        {r.productName}
      </Text>
      <Group gap="md">
        <Text c="dimmed" className="tabular-nums" size="xs">
          {timeText(r)}
        </Text>
        {r.assigneeName && (
          <Text c="dimmed" size="xs">
            {r.assigneeName}
          </Text>
        )}
        <StepDueDateBadge dueDate={r.dueDate} size="xs" status={r.stepStatus} />
      </Group>
    </Stack>
  );

  return (
    <ListShell
      breadcrumbs={[
        tr("common.production"),
        tr("production.workLocationBoard.title"),
      ]}
      filters={
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <DatePickerInput
            aria-label={tr("production.workLocationBoard.date")}
            leftSection={<IconCalendar size={14} />}
            onChange={setDate}
            value={data.date}
            valueFormat="YYYY/MM/DD"
            w={isMobile ? undefined : 170}
          />
          <SecondaryButton
            disabled={data.isToday}
            onClick={() => setDate(null)}
          >
            {tr("production.workLocationBoard.today")}
          </SecondaryButton>
        </Group>
      }
      title={tr("production.workLocationBoard.title")}
    >
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          {data.isToday
            ? tr("production.workLocationBoard.helpToday")
            : tr("production.workLocationBoard.helpOtherDay")}
        </Text>
        {data.groups.length === 0 ? (
          <EmptyState
            icon={<IconMapPin size={20} />}
            message={tr("production.workLocationBoard.empty")}
          />
        ) : (
          data.groups.map((g) => (
            <Paper key={g.location?.id ?? "none"} p="sm" radius="md" withBorder>
              <Group gap="xs" mb="xs" wrap="wrap">
                <IconMapPin size={16} />
                <Title order={5}>
                  {g.location
                    ? g.location.name
                    : tr("production.workLocationBoard.noLocation")}
                </Title>
                {g.location && (
                  <Text c="dimmed" size="xs">
                    {g.location.groupName}
                    {" · "}
                    <Text component="span" ff="mono" size="xs">
                      {g.location.code}
                    </Text>
                  </Text>
                )}
                <Badge color="gray" size="sm" variant="light">
                  {tr("production.workLocationBoard.count", {
                    count: g.rows.length,
                  })}
                </Badge>
              </Group>
              <DataTable
                columns={columns}
                data={g.rows}
                getRowId={(r) => r.key}
                onRowClick={(r) =>
                  router.push(
                    `${WORK_ORDERS_PATH}/${r.workOrderNumber}/steps/${r.stepId}`,
                  )
                }
                pageSize={100}
                renderCard={renderCard}
              />
            </Paper>
          ))
        )}
      </Stack>
    </ListShell>
  );
}
