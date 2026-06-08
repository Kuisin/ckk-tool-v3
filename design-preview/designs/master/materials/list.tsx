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
import { IconBolt, IconSearch } from '@tabler/icons-react';
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
import { MATERIAL_TYPES } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Material form labels (MATERIAL_FORM enum) ────────────────────────────────
const FORM_LABEL: Record<string, string> = {
  POLISHED: '研磨',
  STANDARD_LENGTH: '定尺',
  SEMI_FINISHED: '半製品',
  OTHER: 'その他',
};

const FORM_OPTIONS = Object.entries(FORM_LABEL).map(([value, label]) => ({ value, label }));

// ── Mock data ───────────────────────────────────────────────────────────────
interface MaterialRow {
  id: string;
  materialTypeId: string;
  name: LocalizedText;
  form: keyof typeof FORM_LABEL;
  unit: string;
  isActive: boolean;
}

const MOCK_RECORDS: MaterialRow[] = [
  { id: 'A01A0001-A001-001', materialTypeId: 'A01A0001', name: { ja: 'SUS303 φ20×3000', en: 'SUS303 φ20×3000' }, form: 'POLISHED', unit: '本', isActive: true },
  { id: 'A02B0014-B001-002', materialTypeId: 'A02B0014', name: { ja: 'SKD11 φ32×2500', en: 'SKD11 φ32×2500' }, form: 'STANDARD_LENGTH', unit: '本', isActive: true },
  { id: 'B01A0007-A002-001', materialTypeId: 'B01A0007', name: { ja: 'S45C φ16×4000', en: 'S45C φ16×4000' }, form: 'POLISHED', unit: '本', isActive: true },
  { id: 'A02B0014-C001-001', materialTypeId: 'A02B0014', name: { ja: 'SKD11 半製品ブランク', en: 'SKD11 blank' }, form: 'SEMI_FINISHED', unit: '個', isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

export default function MaterialListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.id.includes(search) || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.materialTypeId === typeFilter;
    const matchesForm = !formFilter || r.form === formFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesForm && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setTypeFilter(null);
    setFormFilter(null);
    setStatusFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '素材']}
        title="素材"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="素材コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="材種"
                data={MATERIAL_TYPES}
                value={typeFilter}
                onChange={setTypeFilter}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="形態"
                data={FORM_OPTIONS}
                value={formFilter}
                onChange={setFormFilter}
                clearable
                style={{ flex: 1 }}
              />
            </Group>
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
              placeholder="素材コード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="材種"
              data={MATERIAL_TYPES}
              value={typeFilter}
              onChange={setTypeFilter}
              searchable
              clearable
              w={180}
            />
            <Select
              placeholder="形態"
              data={FORM_OPTIONS}
              value={formFilter}
              onChange={setFormFilter}
              clearable
              w={130}
            />
            <Select
              placeholder="状態"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              w={120}
            />
            <Button variant="subtle" onClick={reset}>
              リセット
            </Button>
          </Group>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<IconBolt size={24} />} message="素材がありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <DocNumber c="dimmed">{r.id}</DocNumber>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                    <Group gap="md" mt={2}>
                      <Text size="xs" c="dimmed">{FORM_LABEL[r.form]}</Text>
                      <Text size="xs" c="dimmed">{r.unit}</Text>
                    </Group>
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
                <Table.Th>素材コード</Table.Th>
                <Table.Th>材種</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>形態</Table.Th>
                <Table.Th>単位</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber>{r.id}</DocNumber></Table.Td>
                  <Table.Td><DocNumber c="dimmed">{r.materialTypeId}</DocNumber></Table.Td>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td>{FORM_LABEL[r.form]}</Table.Td>
                  <Table.Td>{r.unit}</Table.Td>
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
