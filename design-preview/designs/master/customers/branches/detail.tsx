'use client';

import { useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
} from '../../../lib/ui';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../../lib/shells';
import { useIsMobile } from '../../../lib/viewport-context';
import { DeleteBranchModal } from './_modals/delete';
import { AddContactModal } from '../_modals/add-contact';

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

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-04-10 13:05', detail: '電話番号を更新' },
  { id: 2, action: 'CREATE', user: '鈴木', at: '2025-08-01 09:20', detail: '支店を登録' },
];

export default function BranchDetailPage() {
  const isMobile = useIsMobile();
  const b = MOCK_BRANCH;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '顧客', b.parent.name, '支店', localized(b.name)]}
      title={localized(b.name)}
      status={<ActiveBadge active={b.isActive} />}
      createdAt={`${formatDateTime(b.createdAt)}（${b.createdBy}）`}
      updatedAt={formatDateTime(b.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '担当者を追加', icon: <IconUserPlus size={14} />, onClick: () => setContactOpen(true) },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="BPコード" value={<DocNumber>{b.bpCode}</DocNumber>} />
        <FieldValue label="親法人（顧客）" value={<Anchor size="sm">{b.parent.name}（{b.parent.bpCode}）</Anchor>} />
        <FieldValue label="読み仮名" value={b.nameKana} />
        <FieldValue label="郵便番号" value={b.postalCode} />
        <FieldValue label="住所" value={localized(b.address)} />
        <FieldValue label="電話" value={b.phone} />
        <FieldValue label="FAX" value={b.fax} />
        <FieldValue label="メール" value={b.email} />
      </SummaryGrid>

      <Tabs defaultValue="contacts">
        <Tabs.List>
          <Tabs.Tab value="contacts">担当者</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="contacts" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button variant="default" size="sm" leftSection={<IconUserPlus size={14} />} onClick={() => setContactOpen(true)}>担当者を追加</Button>
          </Group>
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
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeleteBranchModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} branchName={localized(b.name)} />
      <AddContactModal opened={contactOpen} onClose={() => setContactOpen(false)} />
    </DetailShell>
  );
}
