'use client';

import { useState } from 'react';
import { Button, Group, Table, Tabs, Text } from '@mantine/core';
import { IconCopy, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
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
import { PROCESS_STEPS } from '../../lib/mock';
import { DeleteTemplateModal } from './_modals/delete';
import { ToggleActiveTemplateModal } from './_modals/toggle-active';
import { DuplicateTemplateModal } from './_modals/duplicate';
import { AddInspectionItemModal } from './_modals/add-item';

const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  PROCESS_STEPS.map((s) => [s.value, s.label]),
);

interface TemplateItem {
  id: string;
  name: LocalizedText;
  unit: string | null;
  toleranceMin: number | null;
  toleranceMax: number | null;
  isRequired: boolean;
  sortOrder: number;
}

const MOCK_TEMPLATE = {
  id: '1',
  code: 'INSP-CYL-001',
  name: { ja: '円筒加工 寸法検査表', en: 'Cylinder Machining Dimension Inspection' } as LocalizedText,
  relatedStepId: 'CYLINDER_INSPECTION',
  isActive: true,
  createdBy: '鈴木 一郎',
  createdAt: '2026-03-10 09:20',
  updatedAt: '2026-05-12 14:05',
};

const MOCK_ITEMS: TemplateItem[] = [
  { id: 'i1', name: { ja: '外径', en: 'Outer Diameter' }, unit: 'mm', toleranceMin: 19.98, toleranceMax: 20.02, isRequired: true, sortOrder: 1 },
  { id: 'i2', name: { ja: '全長', en: 'Total Length' }, unit: 'mm', toleranceMin: 2999.5, toleranceMax: 3000.5, isRequired: true, sortOrder: 2 },
  { id: 'i3', name: { ja: '真円度', en: 'Roundness' }, unit: 'μm', toleranceMin: null, toleranceMax: 3, isRequired: true, sortOrder: 3 },
  { id: 'i4', name: { ja: '面粗度', en: 'Surface Roughness' }, unit: 'Ra', toleranceMin: null, toleranceMax: 0.8, isRequired: false, sortOrder: 4 },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-05-12 14:05', detail: '検査項目「面粗度」を追加' },
  { id: 2, action: 'UPDATE', user: '田中', at: '2026-04-02 11:30', detail: '許容値（外径）を変更' },
  { id: 3, action: 'CREATE', user: '鈴木', at: '2026-03-10 09:20', detail: 'テンプレートを作成' },
];

function toleranceLabel(item: TemplateItem): string {
  const { toleranceMin, toleranceMax, unit } = item;
  if (toleranceMin == null && toleranceMax == null) return '—';
  const min = toleranceMin == null ? '' : toleranceMin;
  const max = toleranceMax == null ? '' : toleranceMax;
  const u = unit ? ` ${unit}` : '';
  return `${min} ～ ${max}${u}`;
}

export default function InspectionTemplateDetailPage() {
  const t = MOCK_TEMPLATE;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '検査表テンプレート', t.code]}
      title={t.code}
      status={<ActiveBadge active={t.isActive} />}
      createdAt={`${formatDateTime(t.createdAt)}（${t.createdBy}）`}
      updatedAt={formatDateTime(t.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '複製', icon: <IconCopy size={14} />, onClick: () => setDuplicateOpen(true) },
            { label: t.isActive ? '無効化' : '有効化', icon: <IconX size={14} />, onClick: () => setToggleOpen(true) },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="コード" value={<DocNumber>{t.code}</DocNumber>} />
        <FieldValue label="名称" value={localized(t.name)} />
        <FieldValue label="関連工程" value={t.relatedStepId ? PROCESS_LABEL[t.relatedStepId] ?? t.relatedStepId : '—'} />
        <FieldValue label="状態" value={<ActiveBadge active={t.isActive} />} />
        <FieldValue label="検査項目数" value={`${MOCK_ITEMS.length} 項目`} />
        <FieldValue label="作成者" value={t.createdBy} />
      </SummaryGrid>

      <Tabs defaultValue="info">
        <Tabs.List>
          <Tabs.Tab value="info">テンプレート情報</Tabs.Tab>
          <Tabs.Tab value="items">検査項目</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="info" pt="md">
          <SummaryGrid cols={2}>
            <FieldValue label="コード" value={<DocNumber>{t.code}</DocNumber>} />
            <FieldValue label="名称（日本語）" value={t.name.ja} />
            <FieldValue label="名称（英語）" value={t.name.en} />
            <FieldValue label="関連工程" value={t.relatedStepId ? PROCESS_LABEL[t.relatedStepId] ?? t.relatedStepId : '—'} />
            <FieldValue label="状態" value={<ActiveBadge active={t.isActive} />} />
          </SummaryGrid>
        </Tabs.Panel>

        <Tabs.Panel value="items" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAddItemOpen(true)}>
              検査項目を追加
            </Button>
          </Group>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>項目名</Table.Th>
                <Table.Th>単位</Table.Th>
                <Table.Th>許容範囲</Table.Th>
                <Table.Th>必須</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MOCK_ITEMS.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{localized(item.name)}</Table.Td>
                  <Table.Td>{item.unit ?? '—'}</Table.Td>
                  <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>{toleranceLabel(item)}</Table.Td>
                  <Table.Td>
                    {item.isRequired ? <Text size="sm" c="blue">必須</Text> : <Text size="sm" c="dimmed">任意</Text>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeleteTemplateModal opened={deleteOpen} onClose={() => setDeleteOpen(false)} code={t.code} />
      <ToggleActiveTemplateModal opened={toggleOpen} onClose={() => setToggleOpen(false)} code={t.code} isActive={t.isActive} />
      <DuplicateTemplateModal opened={duplicateOpen} onClose={() => setDuplicateOpen(false)} sourceCode={t.code} sourceName={t.name} />
      <AddInspectionItemModal opened={addItemOpen} onClose={() => setAddItemOpen(false)} nextSortOrder={MOCK_ITEMS.length + 1} />
    </DetailShell>
  );
}
