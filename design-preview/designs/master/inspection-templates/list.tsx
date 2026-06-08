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
import { IconListCheck, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  DocNumber,
  EmptyState,
  localized,
  NewButton,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { PROCESS_STEPS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Process step label lookup (related_process_step_id → label) ──────────────
const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  PROCESS_STEPS.map((s) => [s.value, s.label]),
);

// ── Mock data ───────────────────────────────────────────────────────────────
interface InspectionTemplateRow {
  id: string;
  code: string;
  name: LocalizedText;
  relatedStepId: string | null;
  isActive: boolean;
}

const MOCK_RECORDS: InspectionTemplateRow[] = [
  {
    id: '1',
    code: 'INSP-CYL-001',
    name: { ja: '円筒加工 寸法検査表', en: 'Cylinder Machining Dimension Inspection' },
    relatedStepId: 'CYLINDER_INSPECTION',
    isActive: true,
  },
  {
    id: '2',
    code: 'INSP-SHIP-001',
    name: { ja: '出荷前 外観検査表', en: 'Pre-Shipment Visual Inspection' },
    relatedStepId: 'SHIPPING_INSPECTION',
    isActive: true,
  },
  {
    id: '3',
    code: 'INSP-CTR-001',
    name: { ja: 'センタレス 外径検査表', en: 'Centerless Outer Diameter Inspection' },
    relatedStepId: 'CENTERLESS',
    isActive: true,
  },
  {
    id: '4',
    code: 'INSP-COAT-001',
    name: { ja: 'コーティング 膜厚検査表', en: 'Coating Thickness Inspection' },
    relatedStepId: 'COATING',
    isActive: false,
  },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function InspectionTemplateListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || localized(r.name).includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setStatusFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '検査表テンプレート']}
        title="検査表テンプレート"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="状態"
                data={STATUS_OPTIONS}
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
              placeholder="コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="状態"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={160}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconListCheck size={24} />} message="検査表テンプレートがありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.code}</DocNumber>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                    <Text size="xs" c="dimmed" truncate>
                      関連工程: {r.relatedStepId ? PROCESS_LABEL[r.relatedStepId] ?? r.relatedStepId : '—'}
                    </Text>
                  </Stack>
                  <ActiveBadge active={r.isActive} />
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>コード</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>関連工程</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.code}</DocNumber></Table.Td>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td>
                    {r.relatedStepId ? PROCESS_LABEL[r.relatedStepId] ?? r.relatedStepId : '—'}
                  </Table.Td>
                  <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
