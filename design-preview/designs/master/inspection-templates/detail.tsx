import {
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
  formatDateTime,
  localized,
  type LocalizedText,
} from '../../lib/ui';
import { PROCESS_STEPS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  PROCESS_STEPS.map((s) => [s.value, s.label]),
);

// ── Mock data ────────────────────────────────────────────────────────────────
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

const MOCK_AUDIT_LOG = [
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
  const isMobile = useIsMobile();
  const t = MOCK_TEMPLATE;

  return (
    <Stack gap="md">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          {!isMobile && (
            <Group gap={4} wrap="wrap">
              <Text size="sm" c="dimmed">ホーム</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="dimmed">マスタ</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" c="dimmed">検査表テンプレート</Text>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm">{t.code}</Text>
            </Group>
          )}
          <Group gap="sm" align="center" wrap="nowrap">
            <DocNumber>{t.code}</DocNumber>
            <ActiveBadge active={t.isActive} />
          </Group>
          <Text size="lg" fw={600}>{localized(t.name)}</Text>
        </Stack>

        {isMobile ? (
          <Menu shadow="sm" position="bottom-end">
            <Menu.Target>
              <Button variant="default" px="xs" size="sm">
                <IconDotsVertical size={16} />
              </Button>
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

      {/* ── Summary card ──────────────────────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="コード" value={<DocNumber>{t.code}</DocNumber>} />
          <FieldValue label="名称" value={localized(t.name)} />
          <FieldValue
            label="関連工程"
            value={t.relatedStepId ? PROCESS_LABEL[t.relatedStepId] ?? t.relatedStepId : '—'}
          />
          <FieldValue label="状態" value={<ActiveBadge active={t.isActive} />} />
          <FieldValue label="検査項目数" value={`${MOCK_ITEMS.length} 項目`} />
          {!isMobile && <FieldValue label="作成者" value={t.createdBy} />}
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(t.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(t.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="info">
        <Tabs.List>
          <Tabs.Tab value="info">テンプレート情報</Tabs.Tab>
          <Tabs.Tab value="items">検査項目</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="info" pt="md">
          <Paper withBorder p="md" radius="md">
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
              <FieldValue label="コード" value={<DocNumber>{t.code}</DocNumber>} />
              <FieldValue label="名称（日本語）" value={t.name.ja} />
              <FieldValue label="名称（英語）" value={t.name.en} />
              <FieldValue
                label="関連工程"
                value={t.relatedStepId ? PROCESS_LABEL[t.relatedStepId] ?? t.relatedStepId : '—'}
              />
              <FieldValue label="状態" value={<ActiveBadge active={t.isActive} />} />
            </SimpleGrid>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="items" pt="md">
          <Table>
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
                  <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {toleranceLabel(item)}
                  </Table.Td>
                  <Table.Td>
                    {item.isRequired ? (
                      <Text size="sm" c="blue">必須</Text>
                    ) : (
                      <Text size="sm" c="dimmed">任意</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {MOCK_AUDIT_LOG.map((log) => (
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
            <Text size="xs" c="dimmed">作成: {formatDateTime(t.createdAt)}（{t.createdBy}）</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(t.updatedAt)}</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
