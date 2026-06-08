'use client';

import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar, IconSearch, IconSettings2 } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

interface WorkOrderRow {
  id: string;
  workOrderNumber: number;
  salesOrderNumber: string;
  type: 'FROM_STOCK' | 'MANUFACTURE';
  plannedQuantity: number;
  approvalStatus: string;
  status: string;
  updatedAt: string;
}

const MOCK_RECORDS: WorkOrderRow[] = [
  {
    id: '1',
    workOrderNumber: 1042,
    salesOrderNumber: 'ORD-202601-00001-01',
    type: 'MANUFACTURE',
    plannedQuantity: 50,
    approvalStatus: 'APPROVED_1ST',
    status: 'IN_PROGRESS',
    updatedAt: '2026-05-28',
  },
  {
    id: '2',
    workOrderNumber: 1043,
    salesOrderNumber: 'ORD-202601-00001-01',
    type: 'FROM_STOCK',
    plannedQuantity: 20,
    approvalStatus: 'NONE',
    status: 'COMPLETED',
    updatedAt: '2026-05-26',
  },
  {
    id: '3',
    workOrderNumber: 1044,
    salesOrderNumber: 'ORD-202601-00002-01',
    type: 'MANUFACTURE',
    plannedQuantity: 30,
    approvalStatus: 'PENDING_2ND',
    status: 'PENDING_APPROVAL',
    updatedAt: '2026-05-29',
  },
  {
    id: '4',
    workOrderNumber: 1045,
    salesOrderNumber: 'ORD-202601-00003-01',
    type: 'MANUFACTURE',
    plannedQuantity: 10,
    approvalStatus: 'NONE',
    status: 'DRAFT',
    updatedAt: '2026-05-30',
  },
  {
    id: '5',
    workOrderNumber: 1041,
    salesOrderNumber: 'ORD-202512-00018-02',
    type: 'MANUFACTURE',
    plannedQuantity: 120,
    approvalStatus: 'APPROVED',
    status: 'APPROVED',
    updatedAt: '2026-05-24',
  },
];

const TYPE_LABEL: Record<string, string> = {
  FROM_STOCK: '在庫分',
  MANUFACTURE: '製造分',
};

const TYPE_OPTIONS = [
  { value: 'FROM_STOCK', label: '在庫分' },
  { value: 'MANUFACTURE', label: '製造分' },
];

export default function WorkOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      String(r.workOrderNumber).includes(search) ||
      r.salesOrderNumber.includes(search);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesType = !typeFilter || r.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
    setTypeFilter(null);
    setDateFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '生産', '指示書']} title="指示書" actions={<NewButton />} />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="指示書番号・受注番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('WorkOrder')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="種別"
                data={TYPE_OPTIONS}
                value={typeFilter}
                onChange={setTypeFilter}
                clearable
                style={{ flex: 1 }}
              />
            </Group>
            <DatePickerInput
              placeholder="更新日"
              leftSection={<IconCalendar size={14} />}
              valueFormat="YYYY/MM/DD"
              clearable
              value={dateFilter}
              onChange={(v) => setDateFilter(v as unknown as Date | null)}
            />
            <Button variant="subtle" size="sm" onClick={reset}>
              リセット
            </Button>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="指示書番号・受注番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={statusOptions('WorkOrder')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={150}
            />
            <Select
              placeholder="種別"
              data={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
              clearable
              w={130}
            />
            <DatePickerInput
              placeholder="更新日"
              leftSection={<IconCalendar size={14} />}
              valueFormat="YYYY/MM/DD"
              clearable
              w={150}
              value={dateFilter}
              onChange={(v) => setDateFilter(v as unknown as Date | null)}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconSettings2 size={24} />} message="指示書がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">指示書 #{r.workOrderNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.salesOrderNumber}
                    </Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">
                        {TYPE_LABEL[r.type]}
                      </Text>
                      <Text size="xs" c="dimmed">
                        予定 {r.plannedQuantity} 本
                      </Text>
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="WorkOrder" status={r.status} />
                    {r.approvalStatus !== 'NONE' && (
                      <StatusBadge entity="WorkOrderApproval" status={r.approvalStatus} size="xs" variant="light" />
                    )}
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>指示書番号</Table.Th>
                <Table.Th>受注番号</Table.Th>
                <Table.Th>種別</Table.Th>
                <Table.Th ta="right">予定数量</Table.Th>
                <Table.Th>承認状態</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>更新日</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>
                    <DocNumber>#{r.workOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <DocNumber>{r.salesOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>{TYPE_LABEL[r.type]}</Table.Td>
                  <Table.Td ta="right">{r.plannedQuantity} 本</Table.Td>
                  <Table.Td>
                    {r.approvalStatus === 'NONE' ? (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    ) : (
                      <StatusBadge entity="WorkOrderApproval" status={r.approvalStatus} variant="light" />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="WorkOrder" status={r.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.updatedAt)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
