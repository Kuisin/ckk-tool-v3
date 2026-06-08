'use client';

import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconSearch, IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import {
  ActiveBadge,
  EmptyState,
  localized,
  NewButton,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Approval group type (APPROVAL_GROUP_TYPE) ────────────────────────────────
type ApprovalGroupType = 'FIRST' | 'SECOND' | 'WORKFLOW_CHANGE';

const TYPE_CONFIG: Record<ApprovalGroupType, { label: string; color: string }> = {
  FIRST:           { label: '第一承認',     color: 'blue' },
  SECOND:          { label: '第二承認',     color: 'violet' },
  WORKFLOW_CHANGE: { label: '製造変更承認', color: 'orange' },
};

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, c]) => ({ value, label: c.label }));

// ── Mock data ───────────────────────────────────────────────────────────────
interface ApprovalGroupRow {
  id: number;
  name: LocalizedText;
  type: ApprovalGroupType;
  memberCount: number;
  isActive: boolean;
}

const MOCK_RECORDS: ApprovalGroupRow[] = [
  { id: 1, name: { ja: '生産判断グループ', en: 'Production Decision Group' }, type: 'FIRST', memberCount: 3, isActive: true },
  { id: 2, name: { ja: '部門承認グループ', en: 'Department Approval Group' }, type: 'SECOND', memberCount: 2, isActive: true },
  { id: 3, name: { ja: 'ワークフロー変更承認', en: 'Workflow Change Approval' }, type: 'WORKFLOW_CHANGE', memberCount: 2, isActive: true },
  { id: 4, name: { ja: '旧 第一承認グループ', en: 'Legacy First Approval' }, type: 'FIRST', memberCount: 0, isActive: false },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

function TypeBadge({ type }: { type: ApprovalGroupType }) {
  const c = TYPE_CONFIG[type];
  return <Badge color={c.color} variant="light">{c.label}</Badge>;
}

export default function ApprovalGroupListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch = !search || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.type === typeFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesStatus;
  });

  const reset = () => {
    setSearch('');
    setTypeFilter(null);
    setStatusFilter(null);
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '承認グループ']}
        title="承認グループ"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="種別"
                data={TYPE_OPTIONS}
                value={typeFilter}
                onChange={setTypeFilter}
                clearable
                style={{ flex: 1 }}
              />
              <Select
                placeholder="状態"
                data={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ flex: 1 }}
              />
            </Group>
            <Button variant="subtle" size="sm" onClick={reset}>
              リセット
            </Button>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="種別"
              data={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
              clearable
              w={160}
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
          <EmptyState icon={<IconUsersGroup size={24} />} message="承認グループがありません" />
        ) : isMobile ? (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
                    <Group gap="xs">
                      <TypeBadge type={r.type} />
                      <Text size="xs" c="dimmed">メンバー {r.memberCount} 名</Text>
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
                <Table.Th>名称</Table.Th>
                <Table.Th>種別</Table.Th>
                <Table.Th>メンバー数</Table.Th>
                <Table.Th>状態</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                  <Table.Td>{localized(r.name)}</Table.Td>
                  <Table.Td><TypeBadge type={r.type} /></Table.Td>
                  <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.memberCount} 名</Table.Td>
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
