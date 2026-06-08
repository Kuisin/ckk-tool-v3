'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  ActiveBadge,
  FieldValue,
  formatDate,
  formatDateTime,
  localized,
  type LocalizedText,
} from '../../lib/ui';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { USERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteApprovalGroupModal } from './_modals/delete';
import { AddMemberModal } from './_modals/add-member';
import { RemoveMemberModal } from './_modals/remove-member';
import { AddDelegateModal } from './_modals/add-delegate';

type ApprovalGroupType = 'FIRST' | 'SECOND' | 'WORKFLOW_CHANGE';

const TYPE_CONFIG: Record<ApprovalGroupType, { label: string; color: string }> = {
  FIRST:           { label: '第一承認',     color: 'blue' },
  SECOND:          { label: '第二承認',     color: 'violet' },
  WORKFLOW_CHANGE: { label: '製造変更承認', color: 'orange' },
};

const MOCK_GROUP = {
  id: 1,
  name: { ja: '生産判断グループ', en: 'Production Decision Group' } as LocalizedText,
  type: 'FIRST' as ApprovalGroupType,
  isActive: true,
  createdAt: '2026-02-15 10:00',
  updatedAt: '2026-05-20 13:40',
};

interface Member {
  id: string;
  name: string;
  isActive: boolean;
}

const MOCK_MEMBERS: Member[] = [
  { id: 'sato', name: USERS.sato, isActive: true },
  { id: 'yamada', name: USERS.yamada, isActive: true },
  { id: 'ito', name: USERS.ito, isActive: false },
];

interface Delegate {
  id: string;
  delegator: string;
  delegate: string;
  validFrom: string;
  validUntil: string;
  reason: string;
}

const MOCK_DELEGATES: Delegate[] = [
  { id: 'd1', delegator: USERS.sato, delegate: USERS.ito, validFrom: '2026-06-01', validUntil: '2026-06-14', reason: '出張のため' },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-20 13:40', detail: 'メンバー「伊藤 係長」を無効化' },
  { id: 2, action: 'UPDATE', user: '山田', at: '2026-04-10 09:15', detail: '代理設定を追加' },
  { id: 3, action: 'CREATE', user: '鈴木', at: '2026-02-15 10:00', detail: '承認グループを作成' },
];

function TypeBadge({ type }: { type: ApprovalGroupType }) {
  const c = TYPE_CONFIG[type];
  return <Badge color={c.color} variant="light">{c.label}</Badge>;
}

export default function ApprovalGroupDetailPage() {
  const isMobile = useIsMobile();
  const g = MOCK_GROUP;
  const activeMembers = MOCK_MEMBERS.filter((m) => m.isActive).length;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addDelegateOpen, setAddDelegateOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '承認グループ', localized(g.name)]}
      title={localized(g.name)}
      status={<Group gap="xs"><TypeBadge type={g.type} /><ActiveBadge active={g.isActive} /></Group>}
      createdAt={formatDateTime(g.createdAt)}
      updatedAt={formatDateTime(g.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="名称" value={localized(g.name)} />
        <FieldValue label="種別" value={<TypeBadge type={g.type} />} />
        <FieldValue label="状態" value={<ActiveBadge active={g.isActive} />} />
        <FieldValue label="メンバー数" value={`${activeMembers} 名（有効）`} />
        <FieldValue label="代理設定" value={`${MOCK_DELEGATES.length} 件`} />
      </SummaryGrid>

      <Tabs defaultValue="info">
        <Tabs.List>
          <Tabs.Tab value="info">グループ情報</Tabs.Tab>
          <Tabs.Tab value="members">メンバー</Tabs.Tab>
          <Tabs.Tab value="delegates">代理設定</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="info" pt="md">
          <SummaryGrid cols={2}>
            <FieldValue label="名称（日本語）" value={g.name.ja} />
            <FieldValue label="名称（英語）" value={g.name.en} />
            <FieldValue label="種別" value={<TypeBadge type={g.type} />} />
            <FieldValue label="状態" value={<ActiveBadge active={g.isActive} />} />
          </SummaryGrid>
        </Tabs.Panel>

        <Tabs.Panel value="members" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAddMemberOpen(true)}>
              メンバー追加
            </Button>
          </Group>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>氏名</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th style={{ width: 60 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_MEMBERS.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td>{m.name}</Table.Td>
                  <Table.Td><ActiveBadge active={m.isActive} /></Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="red" aria-label="メンバーを削除" onClick={() => setRemoveMemberTarget(m)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="delegates" pt="md">
          <Stack gap="sm">
            <Group justify="flex-end">
              <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAddDelegateOpen(true)}>
                代理追加
              </Button>
            </Group>
            {MOCK_DELEGATES.length === 0 ? (
              <Text size="sm" c="dimmed">代理設定はありません</Text>
            ) : isMobile ? (
              <Stack gap="xs">
                {MOCK_DELEGATES.map((d) => (
                  <Paper key={d.id} withBorder p="sm" radius="sm">
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Stack gap={3} style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600}>{d.delegator} → {d.delegate}</Text>
                        <Text size="xs" c="dimmed">{formatDate(d.validFrom)} ～ {formatDate(d.validUntil)}</Text>
                        <Text size="xs" c="dimmed">{d.reason}</Text>
                      </Stack>
                      <ActionIcon variant="subtle" color="red" aria-label="代理設定を削除">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>原承認者</Table.Th>
                    <Table.Th>代理者</Table.Th>
                    <Table.Th>期間</Table.Th>
                    <Table.Th>理由</Table.Th>
                    <Table.Th style={{ width: 60 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {MOCK_DELEGATES.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>{d.delegator}</Table.Td>
                      <Table.Td>{d.delegate}</Table.Td>
                      <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(d.validFrom)} ～ {formatDate(d.validUntil)}</Table.Td>
                      <Table.Td>{d.reason}</Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" color="red" aria-label="代理設定を削除">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeleteApprovalGroupModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} name={localized(g.name)} />
      <AddMemberModal opened={addMemberOpen} onClose={() => setAddMemberOpen(false)} excludeIds={MOCK_MEMBERS.map((m) => m.id)} />
      <RemoveMemberModal opened={!!removeMemberTarget} onClose={() => setRemoveMemberTarget(null)} memberName={removeMemberTarget?.name ?? ''} />
      <AddDelegateModal opened={addDelegateOpen} onClose={() => setAddDelegateOpen(false)} />
    </DetailShell>
  );
}
