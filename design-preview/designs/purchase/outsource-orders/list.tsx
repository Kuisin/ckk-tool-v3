'use client';

import {
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Button,
} from '@mantine/core';
import { IconTruckDelivery, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  DocNumber,
  EmptyState,
  formatDate,
  NewButton,
  PageHeader,
} from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// 外注可能工程（PROCESS_EXECUTION = INTERNAL_OR_OUTSOURCE のサブセット）
const OUTSOURCE_STEPS = [
  { value: 'CENTERLESS', label: 'センタレス' },
  { value: 'COATING', label: 'コーティング' },
];

// ── Mock data ───────────────────────────────────────────────────────────────
interface OutsourceOrderRow {
  id: string;
  supplierName: string;
  stepName: string;
  stepCode: string;
  workOrderNumber: number;
  requestedAt: string;
  expectedAt: string;
  receivedAt: string | null;
  status: string;
}

const MOCK_RECORDS: OutsourceOrderRow[] = [
  {
    id: '1',
    supplierName: '外注研磨株式会社',
    stepName: 'センタレス',
    stepCode: 'CENTERLESS',
    workOrderNumber: 1042,
    requestedAt: '2026-05-26',
    expectedAt: '2026-06-02',
    receivedAt: null,
    status: 'IN_PROGRESS',
  },
  {
    id: '2',
    supplierName: '中央コーティング工業',
    stepName: 'コーティング',
    stepCode: 'COATING',
    workOrderNumber: 1029,
    requestedAt: '2026-05-18',
    expectedAt: '2026-05-25',
    receivedAt: '2026-05-24',
    status: 'COMPLETED',
  },
  {
    id: '3',
    supplierName: '外注研磨株式会社',
    stepName: 'センタレス',
    stepCode: 'CENTERLESS',
    workOrderNumber: 1051,
    requestedAt: '2026-06-01',
    expectedAt: '2026-06-08',
    receivedAt: null,
    status: 'PENDING',
  },
  {
    id: '4',
    supplierName: '中央コーティング工業',
    stepName: 'コーティング',
    stepCode: 'COATING',
    workOrderNumber: 1004,
    requestedAt: '2026-04-20',
    expectedAt: '2026-04-28',
    receivedAt: null,
    status: 'CANCELLED',
  },
];

export default function OutsourceOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.supplierName.includes(search) ||
      r.stepName.includes(search) ||
      String(r.workOrderNumber).includes(search);
    const matchesSupplier = !supplierFilter || r.supplierName === supplierFilter;
    const matchesStep = !stepFilter || r.stepCode === stepFilter;
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesSupplier && matchesStep && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setSupplierFilter(null);
    setStepFilter(null);
    setStatusFilter(null);
  };

  const supplierOptions = SUPPLIERS.map((s) => ({ value: s.label, label: s.label }));

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '購買', '外注依頼']}
        title="外注依頼"
        actions={<NewButton label="外注依頼登録" />}
      />

      <Paper withBorder p="sm">
        {/* Filter bar */}
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="外注先・工程・指示書番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="外注先"
                data={supplierOptions}
                value={supplierFilter}
                onChange={setSupplierFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="工程"
                data={OUTSOURCE_STEPS}
                value={stepFilter}
                onChange={setStepFilter}
                clearable
                style={{ flex: 1 }}
              />
            </Group>
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={statusOptions('Step')}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Button variant="subtle" size="sm" onClick={reset}>
                リセット
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="外注先・工程・指示書番号で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="外注先"
              data={supplierOptions}
              value={supplierFilter}
              onChange={setSupplierFilter}
              searchable
              clearable
              w={200}
            />
            <Select
              placeholder="工程"
              data={OUTSOURCE_STEPS}
              value={stepFilter}
              onChange={setStepFilter}
              clearable
              w={150}
            />
            <Select
              placeholder="状態"
              data={statusOptions('Step')}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={140}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconTruckDelivery size={24} />}
            message="外注依頼がありません"
            action={
              <Button variant="subtle" size="sm">
                外注依頼登録
              </Button>
            }
          />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">指示書 #{r.workOrderNumber}</DocNumber>
                    <Text size="sm" fw={600} truncate>
                      {r.supplierName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {r.stepName}
                    </Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">
                        依頼: {formatDate(r.requestedAt)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        入荷予定: {formatDate(r.expectedAt)}
                      </Text>
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <StatusBadge entity="Step" status={r.status} />
                    <Text size="xs" c="dimmed">
                      入荷: {formatDate(r.receivedAt)}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>外注先</Table.Th>
                <Table.Th>工程</Table.Th>
                <Table.Th>指示書番号</Table.Th>
                <Table.Th>依頼日</Table.Th>
                <Table.Th>入荷予定日</Table.Th>
                <Table.Th>入荷日</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>{r.supplierName}</Table.Td>
                  <Table.Td>{r.stepName}</Table.Td>
                  <Table.Td>
                    <DocNumber>#{r.workOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.requestedAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.expectedAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(r.receivedAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge entity="Step" status={r.status} />
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
