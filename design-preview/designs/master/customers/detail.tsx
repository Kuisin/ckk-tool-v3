import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconEdit,
  IconPlus,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
  MoneyText,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (business_partners + bp_customer_attrs, CUSTOMER role) ─────────
const MOCK_CUSTOMER = {
  id: 'bp-001',
  bpCode: 'BP-00001',
  name: { ja: '株式会社ABC製作所', en: 'ABC Manufacturing Co., Ltd.' },
  nameKana: 'かぶしきがいしゃえーびーしーせいさくしょ',
  shortName: { ja: 'ABC製作所', en: 'ABC Mfg.' },
  countryCode: 'JP',
  postalCode: '108-0075',
  address: { ja: '東京都港区港南2-15-1', en: '2-15-1 Konan, Minato-ku, Tokyo' },
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@abc-mfg.co.jp',
  website: 'https://abc-mfg.co.jp',
  taxNumber: '1234567890123',
  isActive: true,
  // bp_customer_attrs
  customerCode: 'C-0001',
  billingName: '—（自社）',
  closingDay: 31,
  paymentTermsDays: 30,
  paymentDay: 25,
  creditLimit: 5000000,
  taxType: '課税',
  invoiceMethod: 'メール',
  isConsignment: false,
  createdBy: '鈴木 一郎',
  createdAt: '2025-08-01 09:15',
  updatedAt: '2026-05-28 14:30',
};

const MOCK_CONTACTS = [
  { id: 'ct1', name: '高橋 健', department: '購買部', title: '課長', email: 'takahashi@abc-mfg.co.jp', phone: '03-1234-5680', isPrimary: true },
  { id: 'ct2', name: '渡辺 由美', department: '技術部', title: '主任', email: 'watanabe@abc-mfg.co.jp', phone: '03-1234-5681', isPrimary: false },
];

const MOCK_BRANCHES = [
  { id: 'bp-001-t', name: { ja: '東京本社', en: 'Tokyo HQ' }, phone: '03-1234-5678', contact: '高橋 健' },
  { id: 'bp-001-o', name: { ja: '大阪支社', en: 'Osaka Branch' }, phone: '06-6543-2100', contact: '林 隆' },
];

const MOCK_HISTORY = [
  { id: 'h1', type: 'quote', number: 'QOT-202605-00012', label: '見積書', amount: 320000, date: '2026-05-20', status: { entity: 'Quote' as const, value: 'ISSUED' } },
  { id: 'h2', type: 'order', number: 'ORD-202604-00008', label: '注文受諾書', amount: 450000, date: '2026-04-12', status: { entity: 'OrderAcceptance' as const, value: 'CONFIRMED' } },
  { id: 'h3', type: 'quote', number: 'QOT-202603-00005', label: '見積書', amount: 180000, date: '2026-03-08', status: { entity: 'Quote' as const, value: 'ACCEPTED' } },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-28 14:30', detail: '与信限度額: ¥3,000,000 → ¥5,000,000' },
  { id: 2, action: 'UPDATE', user: '山田', at: '2026-01-15 10:00', detail: '支払サイト: 45日 → 30日' },
  { id: 3, action: 'CREATE', user: '鈴木', at: '2025-08-01 09:15', detail: '顧客を登録' },
];

// ── Main component ───────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const isMobile = useIsMobile();
  const c = MOCK_CUSTOMER;

  return (
    <Stack gap="md">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          {!isMobile && (
            <Group gap={6}>
              <Text size="sm" c="dimmed">ホーム</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="dimmed">マスタ</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="dimmed">顧客</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm">{localized(c.name)}</Text>
            </Group>
          )}
          <Group gap="sm" align="center" wrap="nowrap">
            <Title order={isMobile ? 3 : 2} style={{ whiteSpace: 'nowrap' }}>{localized(c.name)}</Title>
            <ActiveBadge active={c.isActive} />
          </Group>
          <DocNumber c="dimmed">{c.bpCode}</DocNumber>
        </Stack>

        {isMobile ? (
          <Menu shadow="sm" position="bottom-end">
            <Menu.Target>
              <Button variant="default" px="xs" size="sm"><IconDotsVertical size={16} /></Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
              <Menu.Item leftSection={<IconPlus size={14} />}>支店を追加</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Group gap="xs" style={{ flexShrink: 0 }}>
            <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
            <Menu shadow="sm">
              <Menu.Target>
                <Button variant="default" px="xs"><IconDotsVertical size={16} /></Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconPlus size={14} />}>支店を追加</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}
      </Group>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="読み仮名" value={c.nameKana} />
          <FieldValue label="略称" value={localized(c.shortName)} />
          <FieldValue label="国コード" value={c.countryCode} />
          <FieldValue label="郵便番号" value={c.postalCode} />
          <FieldValue label="住所" value={localized(c.address)} />
          <FieldValue label="電話" value={c.phone} />
          <FieldValue label="FAX" value={c.fax} />
          <FieldValue label="メール" value={c.email} />
          <FieldValue label="法人番号" value={c.taxNumber} />
        </SimpleGrid>
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="branches">支店一覧</Tabs.Tab>
          <Tabs.Tab value="history">見積・受注履歴</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 概要: 取引条件 + 担当者 */}
        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">取引条件</Title>
              <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
                <FieldValue label="顧客コード" value={c.customerCode} />
                <FieldValue label="請求先" value={c.billingName} />
                <FieldValue label="締日" value={c.closingDay === 31 ? '月末' : `${c.closingDay} 日`} />
                <FieldValue label="支払サイト" value={`${c.paymentTermsDays} 日`} />
                <FieldValue label="支払日" value={`${c.paymentDay} 日`} />
                <FieldValue label="与信限度額" value={<MoneyText value={c.creditLimit} ta="left" />} />
                <FieldValue label="税区分" value={c.taxType} />
                <FieldValue label="請求方法" value={c.invoiceMethod} />
                <FieldValue label="委託先" value={c.isConsignment ? 'はい' : 'いいえ'} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">担当者</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>氏名</Table.Th>
                    {!isMobile && <Table.Th>部署 / 役職</Table.Th>}
                    {!isMobile && <Table.Th>メール</Table.Th>}
                    <Table.Th>電話</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {MOCK_CONTACTS.map((ct) => (
                    <Table.Tr key={ct.id}>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="sm">{ct.name}</Text>
                          {ct.isPrimary && <Badge color="blue" variant="light" size="xs">主担当</Badge>}
                        </Group>
                      </Table.Td>
                      {!isMobile && <Table.Td><Text size="sm" c="dimmed">{ct.department} / {ct.title}</Text></Table.Td>}
                      {!isMobile && <Table.Td><Text size="sm">{ct.email}</Text></Table.Td>}
                      <Table.Td><Text size="sm">{ct.phone}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* 支店一覧 */}
        <Tabs.Panel value="branches" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button variant="default" size="sm" leftSection={<IconPlus size={14} />}>支店を追加</Button>
          </Group>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>名称</Table.Th>
                <Table.Th>電話</Table.Th>
                <Table.Th>担当者</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_BRANCHES.map((b) => (
                <Table.Tr key={b.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><Anchor size="sm">{localized(b.name)}</Anchor></Table.Td>
                  <Table.Td><Text size="sm">{b.phone}</Text></Table.Td>
                  <Table.Td><Text size="sm">{b.contact}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {/* 見積・受注履歴 */}
        <Tabs.Panel value="history" pt="md">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>番号</Table.Th>
                {!isMobile && <Table.Th>種別</Table.Th>}
                <Table.Th ta="right">金額</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>日付</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_HISTORY.map((h) => (
                <Table.Tr key={h.id} style={{ cursor: 'pointer' }}>
                  <Table.Td><DocNumber c="blue">{h.number}</DocNumber></Table.Td>
                  {!isMobile && <Table.Td><Text size="sm">{h.label}</Text></Table.Td>}
                  <Table.Td><MoneyText value={h.amount} /></Table.Td>
                  <Table.Td><StatusBadge entity={h.status.entity} status={h.status.value} /></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{formatDate(h.date)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {/* 履歴: AuditTimeline */}
        <Tabs.Panel value="audit" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {MOCK_AUDIT_LOG.map((log) => (
              <Timeline.Item key={log.id} bullet={<Text size="xs" fw={700}>{log.user[0]}</Text>} title={log.action}>
                <Text size="xs" c="dimmed">{formatDateTime(log.at)} · {log.user}</Text>
                <Text size="sm" mt={4}>{log.detail}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {/* ── Footer timestamps ─────────────────────────────────────────────── */}
      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">作成: {formatDateTime(c.createdAt)}（{c.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(c.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
