"use client";

/**
 * CustomerDetail.tsx — 顧客 詳細 (MS21, design.md §8.2 / §13.1).
 *
 * タブ: 概要（取引条件・担当者）/ 支店一覧 / 見積・受注履歴 / 履歴。
 * 受注請書・注文請書は該当機能の導入後に履歴へ追加する。
 */

import {
  Badge,
  Checkbox,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconBuildingStore,
  IconCircleMinus,
  IconFileText,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerDetail as CustomerDetailData } from "@/app/(dashboard)/master/_shared/bp-data";
import { BpBaseSummary } from "@/components/master/bp/BpBaseSummary";
import {
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { ContactsTable } from "@/components/master/bp/ContactsTable";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { INVOICE_METHOD_LABEL, TAX_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

const BASE_PATH = "/master/customers";

export function CustomerDetail({
  record,
  auditEntries,
}: {
  record: CustomerDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    bpCode: record.bpCode,
    name: record.nameJa,
    isActive: record.isActive,
  };
  const a = record.attrs;

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
        { label: "顧客", href: BASE_PATH },
        record.bpCode,
      ]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <BpBaseSummary record={record} />

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="branches">支店一覧</Tabs.Tab>
          <Tabs.Tab value="history">見積・受注履歴</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text fw={600} size="sm">
                取引条件
              </Text>
              <Group gap="xl" wrap="wrap">
                <FieldValue
                  label="旧システムコード"
                  value={a.customerCode || "—"}
                />
                <FieldValue label="請求先" value={a.billingName} />
                <FieldValue
                  label="締日"
                  value={
                    a.closingDay != null
                      ? a.closingDay === 31
                        ? "月末"
                        : `${a.closingDay}日`
                      : "—"
                  }
                />
                <FieldValue
                  label="支払サイト"
                  value={
                    a.paymentTermsDays != null ? `${a.paymentTermsDays}日` : "—"
                  }
                />
                <FieldValue
                  label="支払日"
                  value={a.paymentDay != null ? `${a.paymentDay}日` : "—"}
                />
                <FieldValue
                  label="与信限度額"
                  value={formatMoney(a.creditLimit)}
                />
                <FieldValue
                  label="課税区分"
                  value={TAX_TYPE_LABEL[a.taxType] ?? a.taxType}
                />
                <FieldValue
                  label="請求書送付方法"
                  value={
                    INVOICE_METHOD_LABEL[a.invoiceMethod] ?? a.invoiceMethod
                  }
                />
              </Group>
              <Checkbox
                checked={a.isConsignment}
                label="委託先"
                mt={4}
                readOnly
              />
            </Stack>
            <Stack gap="xs">
              <ContactsTable
                bpId={record.id}
                bpName={record.nameJa}
                contacts={record.contacts}
              />
            </Stack>
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="branches">
          <Group justify="flex-end" mb="xs">
            <GhostButton
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                router.push(`${BASE_PATH}/${record.id}/branches/new`)
              }
            >
              支店を追加
            </GhostButton>
          </Group>
          {record.branches.length === 0 ? (
            <EmptyState
              icon={<IconBuildingStore size={24} />}
              message="支店は登録されていません"
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>支店名</Table.Th>
                  {!isMobile && <Table.Th>電話番号</Table.Th>}
                  <Table.Th>主担当</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {record.branches.map((b) => (
                  <Table.Tr
                    className="cursor-pointer"
                    key={b.id}
                    onClick={() =>
                      router.push(`${BASE_PATH}/${record.id}/branches/${b.id}`)
                    }
                  >
                    <Table.Td>{b.name}</Table.Td>
                    {!isMobile && <Table.Td>{b.phone || "—"}</Table.Td>}
                    <Table.Td>{b.contact}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          {record.history.length === 0 ? (
            <EmptyState
              icon={<IconFileText size={24} />}
              message="見積・受注はまだありません"
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>番号</Table.Th>
                  {!isMobile && <Table.Th>種別</Table.Th>}
                  <Table.Th style={{ textAlign: "right" }}>金額</Table.Th>
                  <Table.Th>状態</Table.Th>
                  {!isMobile && <Table.Th>作成日</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {record.history.map((h) => (
                  <Table.Tr
                    className="cursor-pointer"
                    key={h.number}
                    onClick={() => router.push(`/sales/quotes/${h.number}`)}
                  >
                    <Table.Td>
                      <DocNumber>{h.number}</DocNumber>
                    </Table.Td>
                    {!isMobile && (
                      <Table.Td>
                        <Badge color="blue" size="xs" variant="light">
                          {h.label}
                        </Badge>
                      </Table.Td>
                    )}
                    <Table.Td style={{ textAlign: "right" }}>
                      {formatMoney(h.amount)}
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge
                        entity={h.status.entity}
                        status={h.status.value}
                      />
                    </Table.Td>
                    {!isMobile && <Table.Td>{formatDate(h.date)}</Table.Td>}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="audit">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeleteBpModal
        entityLabel="顧客"
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel="顧客"
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
