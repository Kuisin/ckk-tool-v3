import {
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
import { IconDotsVertical, IconEdit } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (business_partners + bp_end_user_attrs, END_USER role) ─────────
const MOCK_END_USER = {
  id: 'eu-001',
  bpCode: 'BP-00101',
  name: { ja: '日本重工業株式会社', en: 'Nihon Heavy Industries Co., Ltd.' },
  nameKana: 'にっぽんじゅうこうぎょう',
  shortName: { ja: '日本重工', en: 'NHI' },
  countryCode: 'JP',
  postalCode: '220-0012',
  address: { ja: '神奈川県横浜市西区みなとみらい3-6-1', en: '3-6-1 Minatomirai, Nishi-ku, Yokohama' },
  phone: '045-123-4567',
  fax: '045-123-4568',
  email: 'info@nihon-hi.co.jp',
  website: 'https://nihon-hi.co.jp',
  taxNumber: '9876543210123',
  isActive: true,
  industry: '産業機械',
  notes: '大口ユーザー。直送案件あり。',
  createdBy: '鈴木 一郎',
  createdAt: '2025-09-10 10:30',
  updatedAt: '2026-05-15 11:00',
};

const MOCK_CONTACTS = [
  { id: 'ct1', name: '小林 誠', department: '調達部', title: '部長', email: 'kobayashi@nihon-hi.co.jp', phone: '045-123-4570', isPrimary: true },
  { id: 'ct2', name: '加藤 真理', department: '設計部', title: '主査', email: 'kato@nihon-hi.co.jp', phone: '045-123-4571', isPrimary: false },
];

const MOCK_DELIVERIES = [
  { id: 'd1', number: 'DRN-202605-00031', via: '株式会社ABC製作所', method: 'ユーザー直送', date: '2026-05-12', status: { entity: 'DeliveryNote' as const, value: 'DELIVERED' } },
  { id: 'd2', number: 'DRN-202604-00018', via: '株式会社DEFエンジニアリング', method: 'ユーザー直送', date: '2026-04-20', status: { entity: 'DeliveryNote' as const, value: 'DELIVERED' } },
  { id: 'd3', number: 'DRN-202603-00009', via: '株式会社ABC製作所', method: 'ユーザー直送', date: '2026-03-05', status: { entity: 'DeliveryNote' as const, value: 'ISSUED' } },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-15 11:00', detail: '業種を更新: 機械 → 産業機械' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-09-10 10:30', detail: '最終需要家を登録' },
];

// ── Main component ───────────────────────────────────────────────────────────
export default function EndUserDetailPage() {
  const isMobile = useIsMobile();
  const e = MOCK_END_USER;

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
              <Text size="sm" c="dimmed">最終需要家</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm">{localized(e.name)}</Text>
            </Group>
          )}
          <Group gap="sm" align="center" wrap="nowrap">
            <Title order={isMobile ? 3 : 2} style={{ whiteSpace: 'nowrap' }}>{localized(e.name)}</Title>
            <ActiveBadge active={e.isActive} />
          </Group>
          <DocNumber c="dimmed">{e.bpCode}</DocNumber>
        </Stack>

        {isMobile ? (
          <Menu shadow="sm" position="bottom-end">
            <Menu.Target>
              <Button variant="default" px="xs" size="sm"><IconDotsVertical size={16} /></Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Group gap="xs" style={{ flexShrink: 0 }}>
            <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
          </Group>
        )}
      </Group>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="読み仮名" value={e.nameKana} />
          <FieldValue label="略称" value={localized(e.shortName)} />
          <FieldValue label="業種" value={e.industry} />
          <FieldValue label="国コード" value={e.countryCode} />
          <FieldValue label="郵便番号" value={e.postalCode} />
          <FieldValue label="住所" value={localized(e.address)} />
          <FieldValue label="電話" value={e.phone} />
          <FieldValue label="FAX" value={e.fax} />
          <FieldValue label="メール" value={e.email} />
        </SimpleGrid>
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 概要: 属性 + 担当者 */}
        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">需要家属性</Title>
              <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                <FieldValue label="業種" value={e.industry} />
                <FieldValue label="ウェブサイト" value={e.website} />
                <FieldValue label="法人番号" value={e.taxNumber} />
                <FieldValue label="備考" value={e.notes} />
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

        {/* 関連: 納品 / 直送履歴 */}
        <Tabs.Panel value="related" pt="md">
          <Paper withBorder p="md" radius="md">
            <Title order={5} mb="sm">納品・直送履歴</Title>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>納品番号</Table.Th>
                  {!isMobile && <Table.Th>受注先</Table.Th>}
                  <Table.Th>方法</Table.Th>
                  <Table.Th>状態</Table.Th>
                  <Table.Th>納品日</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MOCK_DELIVERIES.map((d) => (
                  <Table.Tr key={d.id} style={{ cursor: 'pointer' }}>
                    <Table.Td><DocNumber c="blue">{d.number}</DocNumber></Table.Td>
                    {!isMobile && <Table.Td><Text size="sm">{d.via}</Text></Table.Td>}
                    <Table.Td><Text size="sm" c="dimmed">{d.method}</Text></Table.Td>
                    <Table.Td><StatusBadge entity={d.status.entity} status={d.status.value} /></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{formatDate(d.date)}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
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
            <Text size="xs" c="dimmed">作成: {formatDateTime(e.createdAt)}（{e.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(e.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
