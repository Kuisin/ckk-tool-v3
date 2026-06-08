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
import { IconDotsVertical, IconEdit } from '@tabler/icons-react';
import {
  ActiveBadge,
  DocNumber,
  FieldValue,
  formatDateTime,
  localized,
  PageHeader,
  type LocalizedText,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data (process_step_catalog: 円筒加工) ───────────────────────────────
type ProcessCategory =
  | 'MATERIAL_PREP' | 'MACHINING' | 'COATING' | 'INSPECTION' | 'APPROVAL' | 'SHIPPING';
type ProcessExecution = 'INTERNAL' | 'INTERNAL_OR_OUTSOURCE';

const STEP = {
  id: 4,
  code: 'CYLINDER_MACHINING',
  name: { ja: '円筒加工', en: 'Cylinder Machining' } as LocalizedText,
  category: 'MACHINING' as ProcessCategory,
  executionLocation: 'INTERNAL' as ProcessExecution,
  isSyncCapable: false,
  isInspection: false,
  isApprovalStep: false,
  approvalMinRank: null as string | null,
  sortOrder: 40,
  isActive: true,
  notes: '使用依存: 円筒加工検査・検査承認を含むこと',
  createdAt: '2025-10-01 09:00',
  updatedAt: '2026-05-12 10:30',
};

// process_step_use_dependencies
const USE_DEPENDENCIES = [
  { id: 'u1', step: { ja: '円筒加工検査', en: 'Cylinder Inspection' }, relation: 'AND', isNegation: false },
  { id: 'u2', step: { ja: '円筒加工検査承認', en: 'Cylinder Inspection Approval' }, relation: 'AND', isNegation: false },
];

// process_step_exec_dependencies
const EXEC_DEPENDENCIES = [
  { id: 'e1', step: { ja: 'センタレス', en: 'Centerless' }, relation: 'OR' },
  { id: 'e2', step: { ja: '切断', en: 'Cutting' }, relation: 'OR' },
];

const AUDIT_LOG = [
  { id: 1, action: 'UPDATE', user: '佐藤 工場長', at: '2026-05-12 10:30', detail: '使用依存に「円筒加工検査承認」を追加' },
  { id: 2, action: 'UPDATE', user: '伊藤 係長', at: '2026-01-20 13:45', detail: '実行依存: 「センタレス OR 切断」に変更' },
  { id: 3, action: 'CREATE', user: '鈴木 一郎', at: '2025-10-01 09:00', detail: '工程を登録' },
];

const CATEGORY_LABEL: Record<ProcessCategory, string> = {
  MATERIAL_PREP: '材料準備',
  MACHINING: '加工',
  COATING: 'コーティング',
  INSPECTION: '検査',
  APPROVAL: '検査承認',
  SHIPPING: '出荷',
};

const CATEGORY_COLOR: Record<ProcessCategory, string> = {
  MATERIAL_PREP: 'gray',
  MACHINING: 'violet',
  COATING: 'cyan',
  INSPECTION: 'blue',
  APPROVAL: 'teal',
  SHIPPING: 'orange',
};

const EXECUTION_LABEL: Record<ProcessExecution, string> = {
  INTERNAL: '社内',
  INTERNAL_OR_OUTSOURCE: '社内・外注',
};

function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <Badge size="sm" variant="light" color={on ? 'green' : 'gray'}>
      {on ? `${label} 可` : `${label} 不可`}
    </Badge>
  );
}

function RelationBadge({ relation }: { relation: string }) {
  return (
    <Badge size="sm" variant="outline" color={relation === 'OR' ? 'orange' : 'gray'}>
      {relation}
    </Badge>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ProcessStepDetailPage() {
  const isMobile = useIsMobile();
  const s = STEP;

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '工程マスタ', s.code]}
        title={localized(s.name)}
        align="flex-start"
        status={<Badge variant="light" color={CATEGORY_COLOR[s.category]}>{CATEGORY_LABEL[s.category]}</Badge>}
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

      {/* ── Summary card with flag badges ─────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue label="コード" value={<DocNumber>{s.code}</DocNumber>} />
          <FieldValue label="カテゴリ" value={<Badge variant="light" color={CATEGORY_COLOR[s.category]}>{CATEGORY_LABEL[s.category]}</Badge>} />
          <FieldValue
            label="実施場所"
            value={
              <Badge variant="outline" color={s.executionLocation === 'INTERNAL_OR_OUTSOURCE' ? 'orange' : 'gray'}>
                {EXECUTION_LABEL[s.executionLocation]}
              </Badge>
            }
          />
          <FieldValue label="表示順" value={s.sortOrder} />
          <FieldValue label="承認必要役職" value={s.approvalMinRank} />
          <FieldValue label="状態" value={<ActiveBadge active={s.isActive} />} />
          <FieldValue
            label="フラグ"
            value={
              <Group gap={6}>
                <FlagBadge on={s.isSyncCapable} label="同期" />
                <Badge size="sm" variant="light" color={s.isInspection ? 'blue' : 'gray'}>
                  {s.isInspection ? '検査工程' : '検査なし'}
                </Badge>
                <Badge size="sm" variant="light" color={s.isApprovalStep ? 'teal' : 'gray'}>
                  {s.isApprovalStep ? '承認工程' : '承認なし'}
                </Badge>
              </Group>
            }
          />
          <FieldValue label="備考" value={s.notes} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">作成: {formatDateTime(s.createdAt)}</Text>
            <Text size="xs" c="dimmed">更新: {formatDateTime(s.updatedAt)}</Text>
          </Group>
        )}
      </Paper>

      {/* ── Tabs: 使用依存 / 実行依存 / 履歴 ───────────────────────────── */}
      <Tabs defaultValue="use">
        <Tabs.List>
          <Tabs.Tab value="use">使用依存</Tabs.Tab>
          <Tabs.Tab value="exec">実行依存</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        {/* 使用依存 = ワークフローに含めてよい条件 */}
        <Tabs.Panel value="use" pt="md">
          <Text size="xs" c="dimmed" mb="sm">ワークフローに含めてよい条件</Text>
          {USE_DEPENDENCIES.length === 0 ? (
            <Text size="sm" c="dimmed">使用依存はありません。</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>依存工程</Table.Th>
                  <Table.Th style={{ width: 100 }}>関係</Table.Th>
                  <Table.Th style={{ width: 100 }}>排他</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {USE_DEPENDENCIES.map((d) => (
                  <Table.Tr key={d.id}>
                    <Table.Td><Text size="sm">{localized(d.step)}</Text></Table.Td>
                    <Table.Td><RelationBadge relation={d.relation} /></Table.Td>
                    <Table.Td>
                      {d.isNegation
                        ? <Badge size="sm" color="red" variant="light">排他条件</Badge>
                        : <Text size="sm" c="dimmed">—</Text>}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        {/* 実行依存 = この工程を開始してよい条件（前工程完了） */}
        <Tabs.Panel value="exec" pt="md">
          <Text size="xs" c="dimmed" mb="sm">この工程を開始してよい条件（前工程完了）</Text>
          {EXEC_DEPENDENCIES.length === 0 ? (
            <Text size="sm" c="dimmed">実行依存はありません。</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>依存工程</Table.Th>
                  <Table.Th style={{ width: 100 }}>関係</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {EXEC_DEPENDENCIES.map((d) => (
                  <Table.Tr key={d.id}>
                    <Table.Td><Text size="sm">{localized(d.step)}</Text></Table.Td>
                    <Table.Td><RelationBadge relation={d.relation} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
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
