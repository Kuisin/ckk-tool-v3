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
import { IconDotsVertical, IconEdit } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
} from '../../../lib/ui';
import { useIsMobile } from '../../../lib/viewport-context';

// ── Mock data (business_partners, branch via parent_id) ──────────────────────
const MOCK_BRANCH = {
  id: 'bp-001-t',
  bpCode: 'BP-00001-01',
  name: { ja: '東京本社', en: 'Tokyo HQ' },
  nameKana: 'とうきょうほんしゃ',
  parent: { id: 'bp-001', bpCode: 'BP-00001', name: '株式会社ABC製作所' },
  postalCode: '108-0075',
  address: { ja: '東京都港区港南2-15-1', en: '2-15-1 Konan, Minato-ku, Tokyo' },
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'tokyo@abc-mfg.co.jp',
  isActive: true,
  createdBy: '鈴木 一郎',
  createdAt: '2025-08-01 09:20',
  updatedAt: '2026-04-10 13:05',
};

const MOCK_CONTACTS = [
  { id: 'ct1', name: '高橋 健', department: '購買部', title: '課長', email: 'takahashi@abc-mfg.co.jp', phone: '03-1234-5680', isPrimary: true },
];

const MOCK_AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-04-10 13:05', detail: '電話番号を更新' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-08-01 09:20', detail: '支店を登録' },
];

// ── Main component ───────────────────────────────────────────────────────────
export default function BranchDetailPage() {
  const isMobile = useIsMobile();
  const b = MOCK_BRANCH;

  return (
    <Stack gap="md">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          {!isMobile && (
            <Group gap={6}>
              <Text size="sm" c="dimmed">マスタ</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="dimmed">顧客</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Anchor size="sm">{b.parent.name}</Anchor>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm">{localized(b.name)}</Text>
            </Group>
          )}
          <Group gap="sm" align="center" wrap="nowrap">
            <Title order={isMobile ? 3 : 2} style={{ whiteSpace: 'nowrap' }}>{localized(b.name)}</Title>
            <ActiveBadge active={b.isActive} />
          </Group>
          <Group gap="xs">
            <DocNumber c="dimmed">{b.bpCode}</DocNumber>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">親法人:</Text>
            <Anchor size="xs">{b.parent.name}（{b.parent.bpCode}）</Anchor>
          </Group>
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
          <FieldValue label="読み仮名" value={b.nameKana} />
          <FieldValue label="郵便番号" value={b.postalCode} />
          <FieldValue label="住所" value={localized(b.address)} />
          <FieldValue label="電話" value={b.phone} />
          <FieldValue label="FAX" value={b.fax} />
          <FieldValue label="メール" value={b.email} />
        </SimpleGrid>
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="contacts">
        <Tabs.List>
          <Tabs.Tab value="contacts">担当者</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="contacts" pt="md">
          <Table striped highlightOnHover withTableBorder>
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
        </Tabs.Panel>

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
            <Text size="xs" c="dimmed">作成: {formatDateTime(b.createdAt)}（{b.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(b.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
