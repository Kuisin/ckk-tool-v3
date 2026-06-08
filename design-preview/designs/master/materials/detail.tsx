'use client';

import { useState } from 'react';
import { Badge, Group, Stack, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { IconCircleMinus, IconCopy, IconTrash } from '@tabler/icons-react';
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
import { DeleteMaterialModal } from './_modals/delete';
import { DuplicateMaterialModal } from './_modals/duplicate';
import { ToggleMaterialActiveModal } from './_modals/toggle-active';

const FORM_LABEL: Record<string, string> = {
  POLISHED: '研磨',
  STANDARD_LENGTH: '定尺',
  SEMI_FINISHED: '半製品',
  OTHER: 'その他',
};

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'A01A0001-A001-001',
  materialTypeId: 'A01A0001',
  materialTypeName: 'SUS303',
  name: { ja: 'SUS303 φ20×3000', en: 'SUS303 φ20×3000' } as LocalizedText,
  form: 'POLISHED',
  unit: '本',
  isActive: true,
  notes: '快削ステンレス。研磨済み丸棒。',
  available: 120,
  reserved: 30,
  createdBy: '田中 太郎',
  createdAt: '2025-09-03 11:20',
  updatedAt: '2026-05-10 08:45',
};

const USED_PRODUCTS: { id: string; name: LocalizedText }[] = [
  { id: 'PRD-2601-0001', name: { ja: '精密軸', en: 'Precision shaft' } },
  { id: 'PRD-2603-0012', name: { ja: '特殊加工品', en: 'Custom part' } },
];

const AUDIT_LOG: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026/05/10 08:45', detail: '備考を更新' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2025/09/03 11:20', detail: '素材を作成' },
];

export default function MaterialDetailPage() {
  const isMobile = useIsMobile();
  const m = MOCK;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '素材', m.id]}
      title={localized(m.name)}
      status={<ActiveBadge active={m.isActive} />}
      createdAt={`${formatDateTime(m.createdAt)}（${m.createdBy}）`}
      updatedAt={formatDateTime(m.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '複製', icon: <IconCopy size={14} />, onClick: () => setDuplicateOpen(true) },
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
        <FieldValue label="素材コード" value={<DocNumber>{m.id}</DocNumber>} />
        <FieldValue
          label="材種"
          value={<DocNumber c="blue">{m.materialTypeId}（{m.materialTypeName}）</DocNumber>}
        />
        <FieldValue label="形態" value={FORM_LABEL[m.form]} />
        <FieldValue label="名称（日本語）" value={m.name.ja} />
        <FieldValue label="名称（英語）" value={m.name.en} />
        <FieldValue label="単位" value={m.unit} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <FieldValue label="備考" value={m.notes} />
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text size="sm" fw={600}>在庫</Text>
              <Group gap="xs">
                <Text size="sm">{m.available} {m.unit}</Text>
                {m.reserved > 0 && (
                  <Tooltip label={`予約中: ${m.reserved} ${m.unit}`}>
                    <Badge color="orange" variant="light">予約 {m.reserved}</Badge>
                  </Tooltip>
                )}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>使用製品</Text>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>製品コード</Table.Th>
                    <Table.Th>名称</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {USED_PRODUCTS.map((p) => (
                    <Table.Tr key={p.id} style={{ cursor: 'pointer' }}>
                      <Table.Td><DocNumber c="blue">{p.id}</DocNumber></Table.Td>
                      <Table.Td>{localized(p.name)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT_LOG} />
        </Tabs.Panel>
      </Tabs>

      <DeleteMaterialModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        code={m.id}
        name={localized(m.name)}
      />
      <DuplicateMaterialModal
        opened={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        sourceCode={m.id}
        sourceName={localized(m.name)}
        sourceTypeId={m.materialTypeId}
        sourceForm={m.form}
        sourceUnit={m.unit}
      />
      <ToggleMaterialActiveModal
        opened={toggleOpen}
        onClose={() => setToggleOpen(false)}
        code={m.id}
        name={localized(m.name)}
        isActive={m.isActive}
      />
    </DetailShell>
  );
}
