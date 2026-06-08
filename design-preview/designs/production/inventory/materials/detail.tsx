import {
  Alert,
  Badge,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  DocNumber,
  FieldValue,
  formatDateTime,
  PageHeader,
} from '../../../lib/ui';
import { useIsMobile } from '../../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
const INV = {
  materialCode: 'A01A0001-A001-001',
  materialName: 'SUS303 φ20×3000（研磨）',
  materialType: 'A01A0001 — SUS303',
  materialForm: 'POLISHED',
  quantity: 124.5,
  reserved: 30,
  available: 94.5,
  unit: '本',
  location: 'M-01-2',
  isSemiFinished: false,
  createdAt: '2026-04-10 09:00',
  updatedAt: '2026-05-28 14:30',
};

const MATERIAL_FORM_LABEL: Record<string, string> = {
  POLISHED: '研磨',
  STANDARD_LENGTH: '定尺',
  SEMI_FINISHED: '半製品（外部調達）',
  OTHER: 'その他',
};

// 引当履歴（inventory_reservations）
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
  { id: 'r1', salesOrderNumber: 'ORD-202601-00001-01', workOrderNumber: 1042, quantity: 30, status: 'RESERVED', at: '2026-05-21 10:30' },
  { id: 'r2', salesOrderNumber: 'ORD-202512-00018-02', workOrderNumber: 1029, quantity: 50, status: 'CONFIRMED', at: '2026-05-12 09:00' },
  { id: 'r3', salesOrderNumber: 'ORD-202511-00009-01', workOrderNumber: 1004, quantity: 20, status: 'RELEASED', at: '2026-04-20 16:00' },
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
  { id: 't1', type: 'IN', quantity: 100, reference: '素材入荷（山陽素材商事）', at: '2026-05-28 14:30', user: '田中 太郎' },
  { id: 't2', type: 'RESERVE', quantity: 30, reference: 'ORD-202601-00001-01', at: '2026-05-21 10:30', user: '鈴木 一郎' },
  { id: 't3', type: 'OUT', quantity: 50, reference: '指示書 #1029 投入', at: '2026-05-12 09:00', user: '中村 花子' },
  { id: 't4', type: 'ADJUST', quantity: -0.5, reference: '棚卸 2026-05', at: '2026-05-20 17:00', user: '田中 太郎' },
];

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-28 14:30', detail: '在庫数: 24.5 → 124.5（素材入荷 +100 本）' },
  { id: 2, action: 'UPDATE', user: '中村 花子', at: '2026-05-12 09:00', detail: '在庫数: 74.5 → 24.5（指示書 #1029 投入）' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2026-04-10 09:00', detail: '素材在庫レコードを作成' },
];

function ReservationBadge({ status }: { status: string }) {
  const def = RESERVATION_STATUS[status] ?? { label: status, color: 'gray' };
  return (
    <Badge color={def.color} variant="light">
      {def.label}
    </Badge>
  );
}

function TransactionBadge({ type }: { type: string }) {
  const def = TRANSACTION_TYPE[type] ?? { label: type, color: 'gray' };
  return (
    <Badge color={def.color} variant="light">
      {def.label}
    </Badge>
  );
}

export default function MaterialInventoryDetailPage() {
  const isMobile = useIsMobile();

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '素材在庫', INV.materialCode]}
        title={INV.materialName}
        align="flex-start"
      />

      {/* Summary */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue
            label="素材コード"
            value={<Text size="sm" ff="mono">{INV.materialCode}</Text>}
          />
          <FieldValue label="材種" value={INV.materialType} />
          <FieldValue label="形態" value={MATERIAL_FORM_LABEL[INV.materialForm]} />
          <FieldValue label="在庫数" value={`${INV.quantity} ${INV.unit}`} />
          <FieldValue
            label="予約数"
            value={
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {INV.reserved} {INV.unit}
                </Text>
                {INV.reserved > 0 && (
                  <Badge color="orange" variant="light">
                    予約中
                  </Badge>
                )}
              </Group>
            }
          />
          <FieldValue label="引当可能数" value={`${INV.available} ${INV.unit}`} />
          <FieldValue label="ロケーション" value={INV.location} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">
              作成: {formatDateTime(INV.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(INV.updatedAt)}
            </Text>
          </Group>
        )}
      </Paper>

      {/* リブ母材（半製品）に関する補足 */}
      <Alert icon={<IconInfoCircle size={16} />} color="teal" variant="light">
        リブ母材（半製品）は外部調達のため指示書を持ちません。先行製作判定が必要な場合は素材入荷で受入登録します。
      </Alert>

      {/* Tabs */}
      <Tabs defaultValue="reservations">
        <Tabs.List>
          <Tabs.Tab value="reservations">引当履歴</Tabs.Tab>
          <Tabs.Tab value="transactions">入出庫履歴</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 引当履歴 */}
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
                  <Table.Td>
                    <DocNumber c="blue">{r.salesOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td>
                    <DocNumber>#{r.workOrderNumber}</DocNumber>
                  </Table.Td>
                  <Table.Td ta="right">
                    {r.quantity} {INV.unit}
                  </Table.Td>
                  <Table.Td>
                    <ReservationBadge status={r.status} />
                  </Table.Td>
                  {!isMobile && (
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDateTime(r.at)}
                      </Text>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {/* 入出庫履歴 */}
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
                  <Table.Td>
                    <TransactionBadge type={t.type} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t.quantity > 0 ? `+${t.quantity}` : t.quantity} {INV.unit}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{t.reference}</Text>
                  </Table.Td>
                  {!isMobile && (
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDateTime(t.at)}
                      </Text>
                    </Table.Td>
                  )}
                  {!isMobile && <Table.Td>{t.user}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {/* 履歴（AuditTimeline） */}
        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {AUDIT.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={
                  <Text size="xs" fw={700}>
                    {log.user[0]}
                  </Text>
                }
                title={log.action}
              >
                <Text size="xs" c="dimmed">
                  {formatDateTime(log.at)} · {log.user}
                </Text>
                <Text size="sm" mt={4}>
                  {log.detail}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">
              作成: {formatDateTime(INV.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              更新: {formatDateTime(INV.updatedAt)}
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
