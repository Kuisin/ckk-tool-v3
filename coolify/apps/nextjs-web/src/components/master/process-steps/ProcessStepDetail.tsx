"use client";

/**
 * ProcessStepDetail.tsx — 工程マスタ 詳細 (MS28, design.md §8.2 / §13.3).
 *
 * 依存関係タブに「使用依存」（ワークフローに含めてよい条件。排他 = is_negation）
 * と「実行依存」（開始してよい条件 = 依存先工程の完了）の 2 表を表示する。
 */

import { Badge, Group, Stack, Table, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  dependencyRelationLabel,
  lotInputModeLabel,
  processCategoryLabel,
  processExecutionLabel,
  quantityTrackingLabel,
} from "@/lib/enum-labels";
import {
  DeleteProcessStepModal,
  ToggleProcessStepActiveModal,
} from "./ProcessStepModals";
import { PROCESS_CATEGORY_COLOR } from "./ProcessStepTable";

const BASE_PATH = "/master/process-steps";

export interface ProcessStepDependencyRow {
  dependsOnStepId: number;
  dependsOnCode: string;
  dependsOnName: string;
  relation: string;
  /** 使用依存のみ（実行依存は常に false）。 */
  isNegation: boolean;
  notes: string;
}

export interface ProcessStepDetailData {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  approvalMinRank: string | null;
  quantityTracking: string;
  lotInputMode: string;
  /** 既定作業時間 (h) — 任意。 */
  defaultWorkHours: number | null;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  useDependencies: ProcessStepDependencyRow[];
  execDependencies: ProcessStepDependencyRow[];
  /** 許可作業場所（表示ラベル）。両方空 = 無制限。 */
  allowedLocationTypeLabels: string[];
  allowedLocationLabels: string[];
}

/** 依存表（使用依存 = 排他列あり / 実行依存 = なし）。 */
function DependencyTable({
  rows,
  withNegation,
  emptyMessage,
}: {
  rows: ProcessStepDependencyRow[];
  withNegation: boolean;
  emptyMessage: string;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyMessage}
      </Text>
    );
  }
  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("master.processSteps.stepItDependsOn")}</Table.Th>
          <Table.Th w={140}>{tr("master.processSteps.merge")}</Table.Th>
          {withNegation && <Table.Th w={80}>{tr("common.exclusive")}</Table.Th>}
          {!isMobile && <Table.Th>{tr("common.notes")}</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((d) => (
          <Table.Tr
            className="cursor-pointer"
            key={d.dependsOnStepId}
            onClick={() => router.push(`${BASE_PATH}/${d.dependsOnStepId}`)}
          >
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">{d.dependsOnName}</Text>
                <DocNumber c="dimmed">{d.dependsOnCode}</DocNumber>
              </Group>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                {dependencyRelationLabel(d.relation, locale) ?? d.relation}
              </Text>
            </Table.Td>
            {withNegation && (
              <Table.Td>
                {d.isNegation ? (
                  <Badge color="red" size="xs" variant="light">
                    {tr("common.exclusive")}
                  </Badge>
                ) : (
                  <Text c="dimmed" size="sm">
                    —
                  </Text>
                )}
              </Table.Td>
            )}
            {!isMobile && (
              <Table.Td>
                <Text c="dimmed" size="sm">
                  {d.notes || "—"}
                </Text>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function ProcessStepDetail({
  record,
  auditEntries,
  createdAt,
  updatedAt,
}: {
  record: ProcessStepDetailData;
  auditEntries: AuditEntry[];
  createdAt?: string;
  updatedAt?: string;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
  };

  const flagBadges = (
    <Group gap={6}>
      {record.isSyncCapable && (
        <Badge color="cyan" size="xs" variant="light">
          {tr("common.syncCapable")}
        </Badge>
      )}
      {record.isInspection && (
        <Badge color="blue" size="xs" variant="light">
          {tr("common.inspectionStep")}
        </Badge>
      )}
      {record.isApprovalStep && (
        <Badge color="green" size="xs" variant="light">
          {tr("common.inspectionApproval")}
        </Badge>
      )}
      {!record.isSyncCapable &&
        !record.isInspection &&
        !record.isApprovalStep &&
        "—"}
    </Group>
  );

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: record.isActive ? "無効化" : tr("common.enable"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: "削除",
              icon: <IconTrash size={14} />,
              color: "red",
              divider: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.processSteps"), href: BASE_PATH },
        record.code,
      ]}
      createdAt={createdAt}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={updatedAt}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.stepCode")}
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label={tr("common.nameJapanese")} value={record.nameJa} />
        <FieldValue
          label={tr("common.nameEnglish")}
          value={record.nameEn || "—"}
        />
        <FieldValue
          label={tr("common.category")}
          value={
            <Badge
              color={PROCESS_CATEGORY_COLOR[record.category] ?? "gray"}
              variant="light"
            >
              {processCategoryLabel(record.category, locale) ?? record.category}
            </Badge>
          }
        />
        <FieldValue
          label={tr("common.executionLocation")}
          value={
            processExecutionLabel(record.executionLocation, locale) ??
            record.executionLocation
          }
        />
        <FieldValue
          label={tr("common.quantityTracking")}
          value={
            quantityTrackingLabel(record.quantityTracking, locale) ??
            record.quantityTracking
          }
        />
        <FieldValue
          label={tr("common.lotEntryDefault")}
          value={
            lotInputModeLabel(record.lotInputMode, locale) ??
            record.lotInputMode
          }
        />
        <FieldValue
          label={tr("master.processSteps.defaultWorkHours")}
          value={
            record.defaultWorkHours != null
              ? `${record.defaultWorkHours} h`
              : "—"
          }
        />
        <FieldValue
          label={tr("master.processSteps.stepFlags")}
          value={flagBadges}
        />
        {record.isApprovalStep && (
          <FieldValue
            label={tr("master.processSteps.rankRequiredToApprove")}
            value={record.approvalMinRank || "—"}
          />
        )}
        <FieldValue label={tr("common.sortOrder")} value={record.sortOrder} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="dependencies">
            {tr("master.processSteps.dependencies")}
          </Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue
              label={tr("common.allowedWorkLocations")}
              value={
                record.allowedLocationTypeLabels.length +
                  record.allowedLocationLabels.length ===
                0
                  ? tr("master.processSteps.noRestrictionEveryWorkLocationMay")
                  : [
                      ...record.allowedLocationTypeLabels.map(
                        (l) => `種別: ${l}`,
                      ),
                      ...record.allowedLocationLabels,
                    ].join(" / ")
              }
            />
            <FieldValue
              label={tr("common.notes")}
              value={record.notes || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="dependencies">
          <Stack gap="md">
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {tr("master.processSteps.useDependencyWhenItMayBe")}
              </Text>
              <DependencyTable
                emptyMessage={tr(
                  "master.processSteps.thereAreNoUseDependenciesIt",
                )}
                rows={record.useDependencies}
                withNegation
              />
            </Stack>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {tr("master.processSteps.executionDependencyWhenItMayStart")}
              </Text>
              <DependencyTable
                emptyMessage={tr(
                  "master.processSteps.thereAreNoExecutionDependenciesIt",
                )}
                rows={record.execDependencies}
                withNegation={false}
              />
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteProcessStepModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleProcessStepActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
