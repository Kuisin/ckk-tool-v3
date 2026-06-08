'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import type { FormErrors } from '@mantine/form';
import { PageHeader } from '../../lib/ui';
import { MATERIALS, PROCESS_STEPS, SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

function zodResolver<T>(schema: z.ZodType<T>) {
  return (values: T): FormErrors => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return errors;
  };
}

const SALES_ORDER_OPTIONS = [
  { value: 'so-001', label: 'ORD-202601-00001-01 — 株式会社ABC製作所 / 精密軸' },
  { value: 'so-002', label: 'ORD-202601-00002-01 — 合同会社XYZ工業 / ロッド' },
  { value: 'so-003', label: 'ORD-202601-00003-01 — 株式会社DEFエンジニアリング / 特殊加工品' },
];

const INSPECTION_TEMPLATE_OPTIONS = [
  { value: 'it-cyl', label: '円筒加工検査表' },
  { value: 'it-step', label: '段加工検査表' },
  { value: 'it-ship', label: '出荷前検査表' },
  { value: 'it-coat', label: 'コーティング検査表' },
];

const SOURCE_WO_OPTIONS = [
  { value: 'wo-1041', label: '指示書 #1041 — 精密軸（製造分・5工程）' },
  { value: 'wo-1038', label: '指示書 #1038 — ロッド（製造分・7工程）' },
];

const TYPE_OPTIONS = [
  { value: 'FROM_STOCK', label: '在庫分' },
  { value: 'MANUFACTURE', label: '製造分' },
];

interface StepRow {
  processStepId: string;
  location: 'INTERNAL' | 'OUTSOURCE';
  supplierId: string | null;
  syncCapable: boolean;
}

const stepSchema = z.object({
  processStepId: z.string().min(1, '工程を選択してください'),
  location: z.enum(['INTERNAL', 'OUTSOURCE']),
  supplierId: z.string().nullable(),
  syncCapable: z.boolean(),
});

const workOrderSchema = z.object({
  salesOrderId: z.string().min(1, '受注書を選択してください'),
  type: z.enum(['FROM_STOCK', 'MANUFACTURE']),
  plannedQuantity: z.number().int().min(1, '1以上を入力してください'),
  materialId: z.string().nullable(),
  inspectionTemplateIds: z.array(z.string()),
  sourceWorkOrderId: z.string().nullable(),
  steps: z.array(stepSchema).min(1, '工程を1件以上追加してください'),
});

type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

export default function WorkOrderNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<WorkOrderFormValues>({
    validate: zodResolver(workOrderSchema),
    initialValues: {
      salesOrderId: '',
      type: 'MANUFACTURE',
      plannedQuantity: 1,
      materialId: null,
      inspectionTemplateIds: [],
      sourceWorkOrderId: null,
      steps: [
        { processStepId: 'MATERIAL_PREP', location: 'INTERNAL', supplierId: null, syncCapable: false },
        { processStepId: 'CYLINDER_MACHINING', location: 'INTERNAL', supplierId: null, syncCapable: false },
        { processStepId: 'CYLINDER_INSPECTION', location: 'INTERNAL', supplierId: null, syncCapable: false },
        { processStepId: 'CYLINDER_INSPECTION_APPROVAL', location: 'INTERNAL', supplierId: null, syncCapable: false },
        { processStepId: 'CENTERLESS', location: 'OUTSOURCE', supplierId: 'sp-001', syncCapable: false },
      ],
    },
  });

  const handleSubmit = (values: WorkOrderFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '指示書を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const addStep = () =>
    form.insertListItem('steps', {
      processStepId: '',
      location: 'INTERNAL',
      supplierId: null,
      syncCapable: false,
    } satisfies StepRow);

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= form.values.steps.length) return;
    form.reorderListItem('steps', { from: index, to: target });
  };

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '生産', '指示書', '新規作成']} title="指示書 新規作成" />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          {/* ── 基本情報 ─────────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              基本情報
            </Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="受注書"
                placeholder="受注書を選択"
                data={SALES_ORDER_OPTIONS}
                searchable
                withAsterisk
                {...form.getInputProps('salesOrderId')}
              />
              <Select label="種別" data={TYPE_OPTIONS} withAsterisk {...form.getInputProps('type')} />
              <NumberInput
                label="計画本数"
                min={1}
                withAsterisk
                suffix=" 本"
                {...form.getInputProps('plannedQuantity')}
              />
              <Select
                label="素材"
                placeholder="素材を選択"
                data={MATERIALS}
                searchable
                clearable
                {...form.getInputProps('materialId')}
              />
            </SimpleGrid>
          </Paper>

          {/* ── 検査表テンプレート ───────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              検査表テンプレート
            </Title>
            <Divider mb="md" />
            <MultiSelect
              label="検査表"
              placeholder="この指示書で使用する検査表を選択"
              description="工程ワークフローの検査工程に紐付ける検査表を選択します（複数可）"
              data={INSPECTION_TEMPLATE_OPTIONS}
              searchable
              clearable
              {...form.getInputProps('inspectionTemplateIds')}
            />
          </Paper>

          {/* ── コピー作成 ───────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb="xs">
              <IconCopy size={18} />
              <Title order={4}>コピー作成</Title>
            </Group>
            <Divider mb="md" />
            <Select
              label="既存指示書からコピー"
              placeholder="コピー元の指示書を選択（任意）"
              data={SOURCE_WO_OPTIONS}
              searchable
              clearable
              {...form.getInputProps('sourceWorkOrderId')}
            />
            {form.values.sourceWorkOrderId && (
              <Alert color="yellow" icon={<IconInfoCircle size={16} />} mt="sm" title="バージョン警告">
                コピー元の指示書（{
                  SOURCE_WO_OPTIONS.find((o) => o.value === form.values.sourceWorkOrderId)?.label
                }）は作成後に製品仕様・工程マスタが更新されている可能性があります。工程ワークフローを必ず確認してください。
              </Alert>
            )}
          </Paper>

          {/* ── 工程ワークフロー builder ─────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Title order={4}>工程ワークフロー</Title>
              <Badge variant="light" color="violet">
                {form.values.steps.length} 工程
              </Badge>
            </Group>
            <Divider mb="md" />

            {/* dependency hint */}
            <Alert color="blue" icon={<IconInfoCircle size={16} />} mb="md" title="工程依存チェック">
              <Stack gap={4}>
                <Text size="sm">
                  円筒加工には<b>円筒加工検査・円筒加工検査承認</b>が必要です（使用依存）。
                </Text>
                <Text size="sm">
                  各工程は前工程の完了後に開始可能になります（実行依存）。順序は実行時に依存解決で決定されます。
                </Text>
              </Stack>
            </Alert>

            {typeof form.errors.steps === 'string' && (
              <Text size="xs" c="red" mb="sm">
                {form.errors.steps}
              </Text>
            )}

            <Stack gap="sm">
              {form.values.steps.map((step, index) => (
                <Paper key={index} withBorder p="sm" radius="sm">
                  <Group gap="xs" align="flex-start" wrap={isMobile ? 'wrap' : 'nowrap'}>
                    {/* order controls */}
                    <Stack gap={2} pt={isMobile ? 0 : 22}>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="上へ移動"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="下へ移動"
                        disabled={index === form.values.steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <IconArrowDown size={14} />
                      </ActionIcon>
                    </Stack>

                    <Box style={{ flex: 1, minWidth: isMobile ? '100%' : 200 }}>
                      <Select
                        label={index === 0 && !isMobile ? '工程' : undefined}
                        placeholder="工程を選択"
                        data={PROCESS_STEPS}
                        searchable
                        withAsterisk
                        {...form.getInputProps(`steps.${index}.processStepId`)}
                      />
                    </Box>

                    <Box style={{ width: isMobile ? '100%' : 160 }}>
                      <Text size="xs" c="dimmed" mb={index === 0 && !isMobile ? 0 : undefined}>
                        {index === 0 && !isMobile ? '実施場所' : '実施場所'}
                      </Text>
                      <SegmentedControl
                        fullWidth
                        size="xs"
                        data={[
                          { value: 'INTERNAL', label: '社内' },
                          { value: 'OUTSOURCE', label: '外注' },
                        ]}
                        value={step.location}
                        onChange={(v) => {
                          form.setFieldValue(`steps.${index}.location`, v as StepRow['location']);
                          if (v === 'INTERNAL') form.setFieldValue(`steps.${index}.supplierId`, null);
                        }}
                      />
                    </Box>

                    {step.location === 'OUTSOURCE' && (
                      <Box style={{ width: isMobile ? '100%' : 180 }}>
                        <Select
                          label={index === 0 && !isMobile ? '外注先' : undefined}
                          placeholder="外注先を選択"
                          data={SUPPLIERS}
                          searchable
                          {...form.getInputProps(`steps.${index}.supplierId`)}
                        />
                      </Box>
                    )}

                    <Stack gap={2} align="center" pt={isMobile ? 0 : 18}>
                      <Text size="xs" c="dimmed">
                        同期可
                      </Text>
                      <Switch
                        checked={step.syncCapable}
                        onChange={(e) =>
                          form.setFieldValue(`steps.${index}.syncCapable`, e.currentTarget.checked)
                        }
                        aria-label="同期工程"
                      />
                    </Stack>

                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="lg"
                      mt={isMobile ? 0 : 18}
                      aria-label="工程を削除"
                      disabled={form.values.steps.length === 1}
                      onClick={() => form.removeListItem('steps', index)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
            </Stack>

            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              mt="sm"
              fullWidth={isMobile}
              onClick={addStep}
            >
              工程を追加
            </Button>
          </Paper>

          {/* ── actions ──────────────────────────────────────────── */}
          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>
                保存
              </Button>
              <Button variant="default" fullWidth>
                キャンセル
              </Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default">キャンセル</Button>
              <Button type="submit" loading={isPending}>
                保存
              </Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
