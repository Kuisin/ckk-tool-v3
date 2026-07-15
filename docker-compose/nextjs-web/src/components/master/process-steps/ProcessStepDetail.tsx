"use client";

/**
 * ProcessStepDetail.tsx — 工程マスタ 詳細 (MS27, design.md §8.2 / §13.3).
 *
 * 依存関係タブに「使用依存」（ワークフローに含めてよい条件。排他 = is_negation）
 * と「実行依存」（開始してよい条件 = 依存先工程の完了）の 2 表を表示する。
 */

import { Badge, Group, Stack, Table, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
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
  DEPENDENCY_RELATION_LABEL,
  PROCESS_CATEGORY_LABEL,
  PROCESS_EXECUTION_LABEL,
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
  sortOrder: number;
  isActive: boolean;
  notes: string;
  useDependencies: ProcessStepDependencyRow[];
  execDependencies: ProcessStepDependencyRow[];
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
          <Table.Th>依存先工程</Table.Th>
          <Table.Th w={140}>結合</Table.Th>
          {withNegation && <Table.Th w={80}>排他</Table.Th>}
          {!isMobile && <Table.Th>備考</Table.Th>}
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
                {DEPENDENCY_RELATION_LABEL[d.relation] ?? d.relation}
              </Text>
            </Table.Td>
            {withNegation && (
              <Table.Td>
                {d.isNegation ? (
                  <Badge color="red" size="xs" variant="light">
                    排他
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
          同期可
        </Badge>
      )}
      {record.isInspection && (
        <Badge color="blue" size="xs" variant="light">
          検査工程
        </Badge>
      )}
      {record.isApprovalStep && (
        <Badge color="green" size="xs" variant="light">
          検査承認
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
              label: record.isActive ? "無効化" : "有効化",
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
        "マスタ",
        { label: "工程マスタ", href: BASE_PATH },
        record.code,
      ]}
      createdAt={createdAt}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={updatedAt}
    >
      <SummaryGrid>
        <FieldValue
          label="工程コード"
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
        <FieldValue
          label="カテゴリ"
          value={
            <Badge
              color={PROCESS_CATEGORY_COLOR[record.category] ?? "gray"}
              variant="light"
            >
              {PROCESS_CATEGORY_LABEL[record.category] ?? record.category}
            </Badge>
          }
        />
        <FieldValue
          label="実施場所"
          value={
            PROCESS_EXECUTION_LABEL[record.executionLocation] ??
            record.executionLocation
          }
        />
        <FieldValue label="工程フラグ" value={flagBadges} />
        {record.isApprovalStep && (
          <FieldValue
            label="承認必要役職"
            value={record.approvalMinRank || "—"}
          />
        )}
        <FieldValue label="表示順" value={record.sortOrder} />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="dependencies">依存関係</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="dependencies">
          <Stack gap="md">
            <Stack gap="xs">
              <Text fw={600} size="sm">
                使用依存（ワークフローに含めてよい条件）
              </Text>
              <DependencyTable
                emptyMessage="使用依存はありません（単独でワークフローに含められます）"
                rows={record.useDependencies}
                withNegation
              />
            </Stack>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                実行依存（開始してよい条件 = 依存先工程の完了）
              </Text>
              <DependencyTable
                emptyMessage="実行依存はありません（先行工程なしで開始できます）"
                rows={record.execDependencies}
                withNegation={false}
              />
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

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
