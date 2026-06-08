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
import { IconBuildingFactory2, IconSearch } from '@tabler/icons-react';
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
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (business_partners + bp_vendor_attrs, VENDOR role) ─────────────
type VendorType = 'SUPPLIER' | 'OUTSOURCE';

interface SupplierRow {
  id: string;
  bpCode: string;
  name: LocalizedText;
  vendorType: VendorType;
  leadTimeDays: number | null;
  isActive: boolean;
}

const VENDOR_TYPE_LABEL: Record<VendorType, string> = {
  SUPPLIER: '仕入先',
  OUTSOURCE: '外注先',
};

const MOCK_RECORDS: SupplierRow[] = [
  {
    id: 'sp-001',
    bpCode: 'BP-00021',
    name: { ja: '外注研磨株式会社', en: 'Gaichu Polishing Co., Ltd.' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: 7,
    isActive: true,
  },
  {
    id: 'sp-002',
    bpCode: 'BP-00022',
    name: { ja: '中央コーティング工業', en: 'Chuo Coating Industries' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: 10,
    isActive: true,
  },
  {
    id: 'sp-003',
    bpCode: 'BP-00023',
    name: { ja: '山陽素材商事', en: 'Sanyo Materials Trading' },
    vendorType: 'SUPPLIER',
    leadTimeDays: 14,
    isActive: true,
  },
  {
    id: 'sp-004',
    bpCode: 'BP-00024',
    name: { ja: '関西熱処理サービス', en: 'Kansai Heat Treatment Service' },
    vendorType: 'OUTSOURCE',
    leadTimeDays: null,
    isActive: false,
  },
];

const VENDOR_TYPE_OPTIONS = [
  { value: 'SUPPLIER', label: '仕入先' },
  { value: 'OUTSOURCE', label: '外注先' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '有効' },
  { value: 'inactive', label: '無効' },
];

function VendorTypeBadge({ type }: { type: VendorType }) {
  return (
    <Badge variant="light" color={type === 'OUTSOURCE' ? 'orange' : 'teal'}>
      {VENDOR_TYPE_LABEL[type]}
    </Badge>
  );
}

function leadTimeText(days: number | null): string {
  return days == null ? '—' : `${days} 日`;
}

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileCardList({ records }: { records: SupplierRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconBuildingFactory2 size={24} />} message="外注企業がありません" />;
  }
  return (
    <Stack gap="xs">
      {records.map((r) => (
        <Paper key={r.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">{r.bpCode}</DocNumber>
              <Text size="sm" fw={600} truncate>{localized(r.name)}</Text>
              <Text size="xs" c="dimmed">標準リードタイム: {leadTimeText(r.leadTimeDays)}</Text>
            </Stack>
            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
              <VendorTypeBadge type={r.vendorType} />
              <ActiveBadge active={r.isActive} />
            </Stack>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

// ── Desktop table ────────────────────────────────────────────────────────────
function DesktopTable({ records }: { records: SupplierRow[] }) {
  if (records.length === 0) {
    return <EmptyState icon={<IconBuildingFactory2 size={24} />} message="外注企業がありません" />;
  }
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 120 }}>BPコード</Table.Th>
          <Table.Th>名称</Table.Th>
          <Table.Th style={{ width: 100 }}>外注種別</Table.Th>
          <Table.Th style={{ width: 150 }} ta="right">標準リードタイム</Table.Th>
          <Table.Th style={{ width: 90 }}>状態</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {records.map((r) => (
          <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
            <Table.Td><DocNumber>{r.bpCode}</DocNumber></Table.Td>
            <Table.Td><Text size="sm">{localized(r.name)}</Text></Table.Td>
            <Table.Td><VendorTypeBadge type={r.vendorType} /></Table.Td>
            <Table.Td ta="right"><Text size="sm">{leadTimeText(r.leadTimeDays)}</Text></Table.Td>
            <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SuppliersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search || r.bpCode.includes(search) || localized(r.name).includes(search);
    const matchesType = !typeFilter || r.vendorType === typeFilter;
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
        breadcrumbs={['ホーム', 'マスタ', '外注企業']}
        title="外注企業"
        actions={<NewButton />}
      />

      <Paper withBorder p="sm">
        {isMobile ? (
          <Stack gap="xs" mb="sm">
            <TextInput
              placeholder="BPコード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Select
                placeholder="外注種別"
                data={VENDOR_TYPE_OPTIONS}
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
              <Button variant="subtle" size="sm" onClick={reset}>リセット</Button>
            </Group>
          </Stack>
        ) : (
          <Group mb="sm" align="flex-end">
            <TextInput
              placeholder="BPコード・名称で検索"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="外注種別"
              data={VENDOR_TYPE_OPTIONS}
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
            <Button variant="subtle" onClick={reset}>リセット</Button>
          </Group>
        )}

        {isMobile
          ? <MobileCardList records={filtered} />
          : <DesktopTable records={filtered} />}
      </Paper>
    </Stack>
  );
}
