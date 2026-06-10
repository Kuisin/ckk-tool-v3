'use client';

import { useState } from 'react';
import {
  Anchor,
  Badge,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconCopy,
  IconCircleMinus,
  IconFileTypePdf,
  IconRuler2,
  IconTrash,
} from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
  type LocalizedText,
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
import { DeleteProductModal } from './_modals/delete';
import { DuplicateProductModal } from './_modals/duplicate';
import { ReplaceDesignModal } from './_modals/replace-design';
import { ToggleProductActiveModal } from './_modals/toggle-active';

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK = {
  id: 'PRD-202601-0001',
  name: { ja: '精密軸', en: 'Precision shaft' } as LocalizedText,
  materialId: 'A01A0001-A001-001',
  materialName: 'SUS303 φ20×3000',
  unit: '本',
  isActive: true,
  notes: '主力製品。公差厳しめ。',
  designFile: { name: '精密軸_設計図_v3.pdf', version: 3 },
  spec: [
    { key: '外径', value: 'φ20 ±0.01' },
    { key: '全長', value: '300mm ±0.1' },
    { key: '表面粗さ', value: 'Ra 0.4' },
    { key: '材質', value: 'SUS303' },
    { key: '熱処理', value: 'なし' },
  ],
  available: 80,
  reserved: 20,
  createdBy: '田中 太郎',
  createdAt: '2026-01-15 13:40',
  updatedAt: '2026-05-22 09:05',
};

const RELATED_ORDERS: { id: string; customer: string; quantity: number; status: string }[] = [
  { id: 'ORD-202601-00001-01', customer: '株式会社ABC製作所', quantity: 50, status: 'IN_PRODUCTION' },
  { id: 'ORD-202605-00012-02', customer: '東邦精密株式会社', quantity: 30, status: 'CONFIRMED' },
];

const AUDIT_LOG: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026/05/22 09:05', detail: '仕様（表面粗さ）を更新' },
  { id: 2, action: 'UPDATE', user: '鈴木 一郎', at: '2026/03/10 15:20', detail: '設計図 v3 を登録' },
  { id: 3, action: 'CREATE', user: '田中 太郎', at: '2026/01/15 13:40', detail: '製品を作成' },
];

export default function ProductDetailPage() {
  const isMobile = useIsMobile();
  const p = MOCK;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', 'マスタ', '製品', p.id]}
      title={localized(p.name)}
      status={<ActiveBadge active={p.isActive} />}
      createdAt={`${formatDateTime(p.createdAt)}（${p.createdBy}）`}
      updatedAt={formatDateTime(p.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          pdf={{ label: '設計図', onClick: () => {} }}
          menuItems={[
            { label: '設計図を差し替え', icon: <IconRuler2 size={14} />, onClick: () => setReplaceOpen(true) },
            { label: '複製', icon: <IconCopy size={14} />, onClick: () => setDuplicateOpen(true) },
            {
              label: p.isActive ? '無効化' : '有効化',
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true, onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="製品コード" value={<DocNumber>{p.id}</DocNumber>} />
        <FieldValue label="名称（日本語）" value={p.name.ja} />
        <FieldValue label="名称（英語）" value={p.name.en} />
        <FieldValue
          label="素材"
          value={<DocNumber c="blue">{p.materialId}（{p.materialName}）</DocNumber>}
        />
        <FieldValue label="単位" value={p.unit} />
        <FieldValue
          label="設計図"
          value={
            <Group gap={6} wrap="nowrap">
              <ThemeIcon variant="light" color="red" size="sm" radius="sm">
                <IconFileTypePdf size={14} />
              </ThemeIcon>
              <Anchor size="sm">{p.designFile.name}</Anchor>
              <Badge size="xs" variant="light" color="gray">v{p.designFile.version}</Badge>
            </Group>
          }
        />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 概要: spec rendered as key-value table */}
        <Tabs.Panel value="overview" pt="md">
          <Stack gap="md">
            <Stack gap="xs">
              <Text size="sm" fw={600}>仕様</Text>
              <Table striped withTableBorder>
                <Table.Tbody>
                  {p.spec.map((s) => (
                    <Table.Tr key={s.key}>
                      <Table.Th w={isMobile ? 120 : 200}>{s.key}</Table.Th>
                      <Table.Td>{s.value}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
            <FieldValue label="備考" value={p.notes} />
          </Stack>
        </Tabs.Panel>

        {/* 関連: 在庫 + 受注 */}
        <Tabs.Panel value="related" pt="md">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text size="sm" fw={600}>在庫</Text>
              <Group gap="xs">
                <Text size="sm">{p.available} {p.unit}</Text>
                {p.reserved > 0 && (
                  <Tooltip label={`予約中: ${p.reserved} ${p.unit}`}>
                    <Badge color="orange" variant="light">予約 {p.reserved}</Badge>
                  </Tooltip>
                )}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="sm" fw={600}>受注</Text>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>受注番号</Table.Th>
                    {!isMobile && <Table.Th>顧客</Table.Th>}
                    <Table.Th>数量</Table.Th>
                    <Table.Th>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {RELATED_ORDERS.map((o) => (
                    <Table.Tr key={o.id} style={{ cursor: 'pointer' }}>
                      <Table.Td><DocNumber c="blue">{o.id}</DocNumber></Table.Td>
                      {!isMobile && <Table.Td>{o.customer}</Table.Td>}
                      <Table.Td>{o.quantity} {p.unit}</Table.Td>
                      <Table.Td><StatusBadge entity="SalesOrder" status={o.status} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Stack>
        </Tabs.Panel>

        {/* 履歴: AuditTimeline */}
        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT_LOG} />
        </Tabs.Panel>
      </Tabs>

      <DeleteProductModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        productCode={p.id}
        productName={localized(p.name)}
      />
      <DuplicateProductModal
        opened={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        productCode={p.id}
        sourceName={localized(p.name)}
        sourceUnit={p.unit}
      />
      <ToggleProductActiveModal
        opened={toggleOpen}
        onClose={() => setToggleOpen(false)}
        productCode={p.id}
        productName={localized(p.name)}
        isActive={p.isActive}
      />
      <ReplaceDesignModal
        opened={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        productCode={p.id}
        currentFileName={p.designFile.name}
        currentVersion={p.designFile.version}
      />
    </DetailShell>
  );
}
