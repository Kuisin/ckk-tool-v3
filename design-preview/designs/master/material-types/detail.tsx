'use client';

import { useState } from 'react';
import { Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCircleMinus, IconTrash } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
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
import { useIsMobile } from '../../lib/viewport-context';
import { DeleteMaterialTypeModal } from './_modals/delete';
import { ToggleMaterialTypeActiveModal } from './_modals/toggle-active';

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'A01A0001',
  name: { ja: 'SUS303', en: 'SUS303' } as LocalizedText,
  description: {
    ja: 'オーステナイト系ステンレス鋼（快削）。耐食性に優れ、切削加工性が高い。',
    en: 'Free-machining austenitic stainless steel.',
  } as LocalizedText,
  isActive: true,
  createdBy: '田中 太郎',
  createdAt: '2025-09-01 09:00',
  updatedAt: '2026-05-12 10:30',
};

const RELATED_MATERIALS: {
  id: string;
  name: LocalizedText;
  form: string;
  unit: string;
  isActive: boolean;
}[] = [
  { id: 'A01A0001-A001-001', name: { ja: 'SUS303 φ20×3000', en: '' }, form: '研磨', unit: '本', isActive: true },
  { id: 'A01A0001-A002-001', name: { ja: 'SUS303 φ25×3000', en: '' }, form: '研磨', unit: '本', isActive: true },
  { id: 'A01A0001-B001-003', name: { ja: 'SUS303 φ16×4000', en: '' }, form: '定尺', unit: '本', isActive: false },
];

const AUDIT_LOG: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026/05/12 10:30', detail: '名称を更新' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2025/09/01 09:00', detail: '材種を作成' },
];

export default function MaterialTypeDetailPage() {
  const isMobile = useIsMobile();
  const m = MOCK;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '材種', m.id]}
      title={localized(m.name)}
      status={<ActiveBadge active={m.isActive} />}
      createdAt={`${formatDateTime(m.createdAt)}（${m.createdBy}）`}
      updatedAt={formatDateTime(m.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            {
              label: m.isActive ? '無効化' : '有効化',
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="材種コード" value={<DocNumber>{m.id}</DocNumber>} />
        <FieldValue label="名称（日本語）" value={m.name.ja} />
        <FieldValue label="名称（英語）" value={m.name.en} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <FieldValue label="説明（日本語）" value={m.description.ja} />
            <FieldValue label="説明（英語）" value={m.description.en} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Text size="sm" fw={600}>この材種の素材</Text>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>素材コード</Table.Th>
                  <Table.Th>名称</Table.Th>
                  {!isMobile && <Table.Th>形態</Table.Th>}
                  {!isMobile && <Table.Th>単位</Table.Th>}
                  <Table.Th>状態</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {RELATED_MATERIALS.map((r) => (
                  <Table.Tr key={r.id} style={{ cursor: 'pointer' }}>
                    <Table.Td><DocNumber c="blue">{r.id}</DocNumber></Table.Td>
                    <Table.Td>{localized(r.name)}</Table.Td>
                    {!isMobile && <Table.Td>{r.form}</Table.Td>}
                    {!isMobile && <Table.Td>{r.unit}</Table.Td>}
                    <Table.Td><ActiveBadge active={r.isActive} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT_LOG} />
        </Tabs.Panel>
      </Tabs>

      <DeleteMaterialTypeModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        code={m.id}
        name={localized(m.name)}
      />
      <ToggleMaterialTypeActiveModal
        opened={toggleOpen}
        onClose={() => setToggleOpen(false)}
        code={m.id}
        name={localized(m.name)}
        isActive={m.isActive}
      />
    </DetailShell>
  );
}
