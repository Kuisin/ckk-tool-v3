'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { DocNumber, formatDate } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { DEFECT_TYPES } from '../../lib/mock';

// ── Mock state (toggle these consts to preview different states) ─────────────
const SESSION_LOCKED = false; // true → 別ユーザーがセッション中
const STEP = {
  workOrderNumber: 1042,
  name: '円筒加工検査',
  status: 'IN_PROGRESS' as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  canStart: true,
  templateName: '円筒加工検査表',
};

interface InspItem {
  id: string;
  name: string;
  tolerance: string;
}

const INSPECTION_ITEMS: InspItem[] = [
  { id: 'i1', name: '外径 φ', tolerance: '19.98 〜 20.00 mm' },
  { id: 'i2', name: '真円度', tolerance: '0 〜 0.005 mm' },
  { id: 'i3', name: '表面粗さ Ra', tolerance: '0 〜 0.40 μm' },
  { id: 'i4', name: '全長', tolerance: '2998 〜 3000 mm' },
];

interface DefectEntry {
  defectTypeId: string | null;
  description: string;
}

export default function StepExecutionPage() {
  // local measured-value / result state
  const [measured, setMeasured] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [defects, setDefects] = useState<DefectEntry[]>([{ defectTypeId: null, description: '' }]);

  const setResult = (id: string, v: string) => setResults((p) => ({ ...p, [id]: v }));
  const setVal = (id: string, v: string) => setMeasured((p) => ({ ...p, [id]: v }));

  return (
    <Stack gap="md" p="md">
      {/* ── Step identity ────────────────────────────────────────────── */}
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" align="flex-start">
            <Title order={3}>{STEP.name}</Title>
            <Group gap="sm">
              <DocNumber>指示書 #{STEP.workOrderNumber}</DocNumber>
              <StatusBadge entity="Step" status={STEP.status} size="lg" />
            </Group>
          </Group>

          {SESSION_LOCKED && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title="セッションロック">
              別のユーザーがこの工程のセッション中です。完了または解除されるまで操作できません。
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* ── InspectionRecordForm (design.md §12.5) ──────────────────── */}
      {STEP.status === 'IN_PROGRESS' && (
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="md">
            {STEP.templateName}
          </Title>
          <Table verticalSpacing="md" horizontalSpacing="md" withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>検査項目</Table.Th>
                <Table.Th>許容値</Table.Th>
                <Table.Th style={{ width: 200 }}>実測値</Table.Th>
                <Table.Th style={{ width: 220 }}>合否</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {INSPECTION_ITEMS.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text size="md" fw={500}>
                      {item.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="md" c="dimmed">
                      {item.tolerance}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="lg"
                      placeholder="実測値"
                      value={measured[item.id] ?? ''}
                      onChange={(e) => setVal(item.id, e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <SegmentedControl
                      size="lg"
                      fullWidth
                      color={results[item.id] === 'FAIL' ? 'red' : 'green'}
                      data={[
                        { value: 'PASS', label: '合格' },
                        { value: 'FAIL', label: '不合格' },
                      ]}
                      value={results[item.id] ?? ''}
                      onChange={(v) => setResult(item.id, v)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* ── DefectRecordForm (design.md §12.6) ──────────────────────── */}
      <Paper withBorder p="lg" radius="md">
        <Title order={4} mb="md">
          不良記録（任意）
        </Title>
        <Stack gap="md">
          {defects.map((d, i) => (
            <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
              <Select
                size="lg"
                placeholder="不良種類"
                data={DEFECT_TYPES}
                clearable
                searchable
                style={{ width: 220 }}
                value={d.defectTypeId}
                onChange={(v) =>
                  setDefects((p) => p.map((x, idx) => (idx === i ? { ...x, defectTypeId: v } : x)))
                }
              />
              <Textarea
                size="lg"
                placeholder={d.defectTypeId ? '詳細を入力してください' : '詳細（不良種類選択時は必須）'}
                autosize
                minRows={1}
                style={{ flex: 1 }}
                value={d.description}
                onChange={(e) =>
                  setDefects((p) =>
                    p.map((x, idx) => (idx === i ? { ...x, description: e.currentTarget.value } : x)),
                  )
                }
              />
              <ActionIcon
                size="xl"
                variant="subtle"
                color="red"
                aria-label="不良記録を削除"
                disabled={defects.length === 1}
                onClick={() => setDefects((p) => p.filter((_, idx) => idx !== i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            size="lg"
            leftSection={<IconPlus size={18} />}
            onClick={() => setDefects((p) => [...p, { defectTypeId: null, description: '' }])}
          >
            追加
          </Button>
        </Stack>
      </Paper>

      <Divider />

      {/* ── Action buttons ───────────────────────────────────────────── */}
      <Group justify="center" mt="xl" gap="lg">
        {STEP.status === 'PENDING' && STEP.canStart && (
          <Button size="lg" color="blue" disabled={SESSION_LOCKED}>
            工程開始
          </Button>
        )}
        {STEP.status === 'IN_PROGRESS' && (
          <>
            <Button size="lg" color="green" disabled={SESSION_LOCKED}>
              工程完了
            </Button>
            <Button size="lg" color="red" variant="outline" disabled={SESSION_LOCKED}>
              キャンセル（巻き戻し）
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}
