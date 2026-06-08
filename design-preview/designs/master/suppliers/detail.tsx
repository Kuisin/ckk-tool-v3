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
} from '@mantine/core';
import {
  IconDotsVertical,
  IconEdit,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (business_partners + bp_vendor_attrs, BP-00021) ────────────────
const SUPPLIER = {
  id: 'sp-001',
  bpCode: 'BP-00021',
  name: { ja: '外注研磨株式会社', en: 'Gaichu Polishing Co., Ltd.' } as LocalizedText,
  nameKana: 'がいちゅうけんま',
  shortName: '外注研磨',
  vendorType: 'OUTSOURCE' as 'SUPPLIER' | 'OUTSOURCE',
  vendorCode: 'V-00021',
  countryCode: 'JP',
  postalCode: '143-0006',
  address: '東京都大田区平和島1-2-3',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@gaichu-kenma.co.jp',
  isActive: true,
  // 取引条件
  closingDay: 31,
  paymentTermsDays: 60,
  paymentDay: 31,
  leadTimeDays: 7,
  // 振込先
  bankName: 'みずほ銀行',
  bankBranch: '大森支店',
  bankAccountType: '普通',
  bankAccountNumber: '1234567',
  createdAt: '2025-11-04 09:15',
  updatedAt: '2026-05-28 14:30',
};

const CONTACTS = [
  { id: 'c1', name: '小林 健', title: '営業課長', department: '営業部', phone: '03-1234-5678', email: 'kobayashi@gaichu-kenma.co.jp', isPrimary: true },
  { id: 'c2', name: '渡辺 良子', title: '担当', department: '製造部', phone: '03-1234-5680', email: 'watanabe@gaichu-kenma.co.jp', isPrimary: false },
];

const OUTSOURCE_HISTORY = [
  { id: 'o1', process: 'センタレス', requestedAt: '2026-05-25', expectedAt: '2026-06-02', receivedAt: null, status: 'IN_PROGRESS' },
  { id: 'o2', process: 'センタレス', requestedAt: '2026-04-10', expectedAt: '2026-04-17', receivedAt: '2026-04-16', status: 'RECEIVED' },
  { id: 'o3', process: 'センタレス', requestedAt: '2026-03-02', expectedAt: '2026-03-09', receivedAt: '2026-03-08', status: 'RECEIVED' },
];

const AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '佐藤 工場長', at: '2026-05-28 14:30', detail: '標準リードタイム: 5日 → 7日' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026-02-14 11:05', detail: '振込先口座を更新' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2025-11-04 09:15', detail: '外注企業を登録' },
];

const VENDOR_TYPE_LABEL: Record<'SUPPLIER' | 'OUTSOURCE', string> = {
  SUPPLIER: '仕入先',
  OUTSOURCE: '外注先',
};

function VendorTypeBadge({ type }: { type: 'SUPPLIER' | 'OUTSOURCE' }) {
  return (
    <Badge variant="light" color={type === 'OUTSOURCE' ? 'orange' : 'teal'}>
      {VENDOR_TYPE_LABEL[type]}
    </Badge>
  );
}

function OutsourceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    IN_PROGRESS: { label: '依頼中', color: 'blue' },
    RECEIVED: { label: '入荷済', color: 'green' },
  };
  const def = map[status] ?? { label: status, color: 'gray' };
  return <Badge color={def.color}>{def.label}</Badge>;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SupplierDetailPage() {
  const isMobile = useIsMobile();
  const s = SUPPLIER;

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '外注企業', s.bpCode]}
        title={localized(s.name)}
        align="flex-start"
        status={<VendorTypeBadge type={s.vendorType} />}
        actions={
          isMobile ? (
            <Menu shadow="sm" position="bottom-end">
              <Menu.Target>
                <Button variant="default" px="xs" size="sm">
                  <IconDotsVertical size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEdit size={14} />}>編集</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red">無効化</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Group gap="xs" style={{ flexShrink: 0 }}>
              <Button variant="default" leftSection={<IconEdit size={14} />}>編集</Button>
              <Menu shadow="sm">
                <Menu.Target>
                  <Button variant="default" px="xs">
                    <IconDotsVertical size={16} />
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item color="red">無効化</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )
        }
      />

      {/* ── Summary card ──────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="BPコード" value={<DocNumber>{s.bpCode}</DocNumber>} />
          <FieldValue label="外注種別" value={<VendorTypeBadge type={s.vendorType} />} />
          <FieldValue label="状態" value={<ActiveBadge active={s.isActive} />} />
          <FieldValue label="読み仮名" value={s.nameKana} />
          <FieldValue label="略称" value={s.shortName} />
          <FieldValue label="仕入先コード" value={s.vendorCode} />
          <FieldValue label="電話" value={s.phone} />
          <FieldValue label="FAX" value={s.fax} />
          <FieldValue label="メール" value={s.email} />
          <FieldValue label="郵便番号" value={s.postalCode} />
          <FieldValue label="住所" value={s.address} />
          <FieldValue label="標準リードタイム" value={`${s.leadTimeDays} 日`} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(s.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(s.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 概要: 取引条件 + 振込先 + 担当者 */}
        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Text fw={600} size="sm" mb="sm">取引条件</Text>
              <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
                <FieldValue label="締日" value={s.closingDay === 31 ? '月末' : `${s.closingDay} 日`} />
                <FieldValue label="支払サイト" value={`${s.paymentTermsDays} 日`} />
                <FieldValue label="支払日" value={s.paymentDay === 31 ? '月末' : `${s.paymentDay} 日`} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Text fw={600} size="sm" mb="sm">振込先</Text>
              <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
                <FieldValue label="銀行名" value={s.bankName} />
                <FieldValue label="支店" value={s.bankBranch} />
                <FieldValue label="口座種別" value={s.bankAccountType} />
                <FieldValue label="口座番号" value={<DocNumber>{s.bankAccountNumber}</DocNumber>} />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Text fw={600} size="sm" mb="sm">担当者</Text>
              {isMobile ? (
                <Stack gap="xs">
                  {CONTACTS.map((c) => (
                    <Paper key={c.id} withBorder p="sm" radius="sm">
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Group gap="xs">
                            <Text size="sm" fw={600}>{c.name}</Text>
                            {c.isPrimary && <Badge size="xs" color="blue" variant="light">主担当</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed">{c.department}・{c.title}</Text>
                          <Text size="xs" c="dimmed">{c.phone}</Text>
                          <Text size="xs" c="dimmed">{c.email}</Text>
                        </Stack>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>氏名</Table.Th>
                      <Table.Th>部署・役職</Table.Th>
                      <Table.Th>電話</Table.Th>
                      <Table.Th>メール</Table.Th>
                      <Table.Th style={{ width: 90 }}>主担当</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {CONTACTS.map((c) => (
                      <Table.Tr key={c.id}>
                        <Table.Td><Text size="sm" fw={500}>{c.name}</Text></Table.Td>
                        <Table.Td><Text size="sm" c="dimmed">{c.department}・{c.title}</Text></Table.Td>
                        <Table.Td><Text size="sm">{c.phone}</Text></Table.Td>
                        <Table.Td><Text size="sm">{c.email}</Text></Table.Td>
                        <Table.Td>{c.isPrimary && <Badge size="xs" color="blue" variant="light">主担当</Badge>}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* 関連: 外注依頼履歴 */}
        <Tabs.Panel value="related" pt="md">
          <Paper withBorder p="md" radius="md">
            <Text fw={600} size="sm" mb="sm">外注依頼履歴</Text>
            {isMobile ? (
              <Stack gap="xs">
                {OUTSOURCE_HISTORY.map((o) => (
                  <Paper key={o.id} withBorder p="sm" radius="sm">
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600}>{o.process}</Text>
                        <Text size="xs" c="dimmed">依頼: {formatDate(o.requestedAt)}</Text>
                        <Text size="xs" c="dimmed">入荷予定: {formatDate(o.expectedAt)}</Text>
                        <Text size="xs" c="dimmed">入荷: {formatDate(o.receivedAt)}</Text>
                      </Stack>
                      <OutsourceStatusBadge status={o.status} />
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>工程</Table.Th>
                    <Table.Th>依頼日</Table.Th>
                    <Table.Th>入荷予定日</Table.Th>
                    <Table.Th>入荷日</Table.Th>
                    <Table.Th style={{ width: 100 }}>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {OUTSOURCE_HISTORY.map((o) => (
                    <Table.Tr key={o.id}>
                      <Table.Td><Text size="sm">{o.process}</Text></Table.Td>
                      <Table.Td><Text size="sm">{formatDate(o.requestedAt)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{formatDate(o.expectedAt)}</Text></Table.Td>
                      <Table.Td><Text size="sm">{formatDate(o.receivedAt)}</Text></Table.Td>
                      <Table.Td><OutsourceStatusBadge status={o.status} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Tabs.Panel>

        {/* 履歴: AuditTimeline */}
        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {AUDIT_LOG.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={<Text size="xs" fw={700}>{log.user[0]}</Text>}
                title={log.action}
              >
                <Text size="xs" c="dimmed">{formatDateTime(log.at)} · {log.user}</Text>
                <Text size="sm" mt={4}>{log.detail}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {/* ── Footer timestamps ─────────────────────────────────────────── */}
      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">作成: {formatDateTime(s.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(s.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
