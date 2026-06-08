'use client';

import { useState } from 'react';
import { Badge, Group, Table, Tabs, Text } from '@mantine/core';
import { IconAdjustments, IconBookmark, IconBookmarkOff } from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDateTime } from '../../../lib/ui';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../../lib/shells';
import { useIsMobile } from '../../../lib/viewport-context';
import { AdjustProductStockModal } from './_modals/adjust-stock';
import { ReserveProductModal } from './_modals/reserve';
import { ReleaseProductReservationModal } from './_modals/release';

// ── Mock data ────────────────────────────────────────────────────────────────
const INV = {
  productName: '精密軸 PRD-2601-0001',
  lotNumber: 1042,
  quantity: 50,
  reserved: 20,
  available: 30,
  location: 'A-12-3',
  createdAt: '2026-05-21 10:00',
  updatedAt: '2026-05-28 14:30',
};

// 引当履歴（inventory_reservations）— status は StatusBadge 対象外のためローカルマップ
const RESERVATION_STATUS: Record<string, { label: string; color: string }> = {
  RESERVED: { label: '予約中', color: 'orange' },
  CONFIRMED: { label: '引当', color: 'blue' },
  RELEASED: { label: '解除', color: 'gray' },
};

interface Reservation {
  id: string;
  salesOrderNumber: string;
  workOrderNumber: number;
  quantity: number;
  status: string;
  at: string;
}

const RESERVATIONS: Reservation[] = [
  { id: 'r1', salesOrderNumber: 'ORD-202601-00001-01', workOrderNumber: 1042, quantity: 20, status: 'RESERVED', at: '2026-05-21 10:30' },
  { id: 'r2', salesOrderNumber: 'ORD-202512-00018-02', workOrderNumber: 1029, quantity: 40, status: 'CONFIRMED', at: '2026-05-12 09:00' },
  { id: 'r3', salesOrderNumber: 'ORD-202512-00012-01', workOrderNumber: 1015, quantity: 15, status: 'RELEASED', at: '2026-04-28 16:00' },
];

// 入出庫履歴（inventory_transactions）
const TRANSACTION_TYPE: Record<string, { label: string; color: string }> = {
  IN: { label: '入庫', color: 'green' },
  OUT: { label: '出庫', color: 'red' },
  RESERVE: { label: '予約', color: 'orange' },
  RELEASE: { label: '予約解除', color: 'gray' },
  ADJUST: { label: '棚卸調整', color: 'violet' },
};

interface Transaction {
  id: string;
  type: string;
  quantity: number;
  reference: string;
  at: string;
  user: string;
}

const TRANSACTIONS: Transaction[] = [
  { id: 't1', type: 'IN', quantity: 50, reference: '指示書 #1042', at: '2026-05-28 14:30', user: '中村 花子' },
  { id: 't2', type: 'RESERVE', quantity: 20, reference: 'ORD-202601-00001-01', at: '2026-05-21 10:30', user: '鈴木 一郎' },
  { id: 't3', type: 'ADJUST', quantity: -2, reference: '棚卸 2026-05', at: '2026-05-20 17:00', user: '田中 太郎' },
  { id: 't4', type: 'OUT', quantity: 18, reference: '出荷書 SH-001', at: '2026-05-15 11:00', user: '佐藤 工場長' },
];

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '中村 花子', at: '2026-05-28 14:30', detail: '在庫数: 0 → 50（指示書 #1042 完了）' },
  { id: 2, action: 'UPDATE', user: '田中 太郎', at: '2026-05-20 17:00', detail: '棚卸調整: -2 本' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-21 10:00', detail: '製品在庫レコードを作成' },
];

function ReservationBadge({ status }: { status: string }) {
  const def = RESERVATION_STATUS[status] ?? { label: status, color: 'gray' };
  return <Badge color={def.color} variant="light">{def.label}</Badge>;
}

function TransactionBadge({ type }: { type: string }) {
  const def = TRANSACTION_TYPE[type] ?? { label: type, color: 'gray' };
  return <Badge color={def.color} variant="light">{def.label}</Badge>;
}

export default function ProductInventoryDetailPage() {
  const isMobile = useIsMobile();
  const label = `${INV.productName}（ロット #${INV.lotNumber}）`;

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '生産', '製品在庫', `ロット #${INV.lotNumber}`]}
      title={INV.productName}
      createdAt={formatDateTime(INV.createdAt)}
      updatedAt={formatDateTime(INV.updatedAt)}
      actions={
        <ResourceActions
          menuItems={[
            { label: '棚卸調整', icon: <IconAdjustments size={14} />, color: 'violet', onClick: () => setAdjustOpen(true) },
            { label: '引当予約', icon: <IconBookmark size={14} />, onClick: () => setReserveOpen(true) },
            { label: '予約解除', icon: <IconBookmarkOff size={14} />, color: 'red', divider: true, onClick: () => setReleaseOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="製品" value={INV.productName} />
        <FieldValue label="ロット番号" value={<DocNumber>#{INV.lotNumber}</DocNumber>} />
        <FieldValue label="ロケーション" value={INV.location} />
        <FieldValue label="在庫数" value={`${INV.quantity} 本`} />
        <FieldValue
          label="予約数"
          value={
            <Group gap="xs">
              <Text size="sm" fw={500}>{INV.reserved} 本</Text>
              {INV.reserved > 0 && <Badge color="orange" variant="light">予約中</Badge>}
            </Group>
          }
        />
        <FieldValue label="引当可能数" value={`${INV.available} 本`} />
      </SummaryGrid>

      <Tabs defaultValue="reservations">
        <Tabs.List>
          <Tabs.Tab value="reservations">引当履歴</Tabs.Tab>
          <Tabs.Tab value="transactions">入出庫履歴</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="reservations" pt="md">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>受注書</Table.Th>
                <Table.Th>指示書</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th>状態</Table.Th>
                {!isMobile && <Table.Th>日時</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {RESERVATIONS.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td><DocNumber c="blue">{r.salesOrderNumber}</DocNumber></Table.Td>
                  <Table.Td><DocNumber>#{r.workOrderNumber}</DocNumber></Table.Td>
                  <Table.Td ta="right">{r.quantity} 本</Table.Td>
                  <Table.Td><ReservationBadge status={r.status} /></Table.Td>
                  {!isMobile && <Table.Td><Text size="sm" c="dimmed">{formatDateTime(r.at)}</Text></Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="transactions" pt="md">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>種別</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th>参照</Table.Th>
                {!isMobile && <Table.Th>日時</Table.Th>}
                {!isMobile && <Table.Th>操作者</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {TRANSACTIONS.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td><TransactionBadge type={t.type} /></Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t.quantity > 0 ? `+${t.quantity}` : t.quantity} 本
                    </Text>
                  </Table.Td>
                  <Table.Td><Text size="sm">{t.reference}</Text></Table.Td>
                  {!isMobile && <Table.Td><Text size="sm" c="dimmed">{formatDateTime(t.at)}</Text></Table.Td>}
                  {!isMobile && <Table.Td>{t.user}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <AdjustProductStockModal opened={adjustOpen} onClose={() => setAdjustOpen(false)} label={label} unit="本" />
      <ReserveProductModal opened={reserveOpen} onClose={() => setReserveOpen(false)} label={label} available={INV.available} unit="本" />
      <ReleaseProductReservationModal opened={releaseOpen} onClose={() => setReleaseOpen(false)} label={label} reserved={INV.reserved} unit="本" />
    </DetailShell>
  );
}
