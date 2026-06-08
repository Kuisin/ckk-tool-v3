'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { IconCircleMinus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
} from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';
import { ToggleActiveModal } from './_modals/toggle-active';
import { DeleteEndUserModal } from './_modals/delete';
import { AddContactModal } from './_modals/add-contact';

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

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-15 11:00', detail: '業種を更新: 機械 → 産業機械' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-09-10 10:30', detail: '最終需要家を登録' },
];

export default function EndUserDetailPage() {
  const isMobile = useIsMobile();
  const e = MOCK_END_USER;

  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '最終需要家', localized(e.name)]}
      title={localized(e.name)}
      status={<ActiveBadge active={e.isActive} />}
      createdAt={`${formatDateTime(e.createdAt)}（${e.createdBy}）`}
      updatedAt={formatDateTime(e.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '担当者を追加', icon: <IconUserPlus size={14} />, onClick: () => setContactOpen(true) },
            {
              label: e.isActive ? '無効化' : '有効化',
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="BPコード" value={<DocNumber>{e.bpCode}</DocNumber>} />
        <FieldValue label="読み仮名" value={e.nameKana} />
        <FieldValue label="略称" value={localized(e.shortName)} />
        <FieldValue label="業種" value={e.industry} />
        <FieldValue label="国コード" value={e.countryCode} />
        <FieldValue label="郵便番号" value={e.postalCode} />
        <FieldValue label="住所" value={localized(e.address)} />
        <FieldValue label="電話" value={e.phone} />
        <FieldValue label="FAX" value={e.fax} />
        <FieldValue label="メール" value={e.email} />
      </SummaryGrid>

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
              <Group justify="space-between" mb="sm">
                <Title order={5}>担当者</Title>
                <Button variant="default" size="xs" leftSection={<IconUserPlus size={14} />} onClick={() => setContactOpen(true)}>
                  担当者を追加
                </Button>
              </Group>
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
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <ToggleActiveModal opened={toggleOpen} onClose={() => setToggleOpen(false)} next={!e.isActive} endUserName={localized(e.name)} />
      <DeleteEndUserModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} endUserName={localized(e.name)} />
      <AddContactModal opened={contactOpen} onClose={() => setContactOpen(false)} />
    </DetailShell>
  );
}
