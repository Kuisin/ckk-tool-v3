'use client';

import { useTransition } from 'react';
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm, type FormErrors, type UseFormReturnType } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconMinus, IconPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { PROCESS_STEPS } from '../../lib/mock';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { ActiveBadge } from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Zod schema ───────────────────────────────────────────────────────────────
const useDependencySchema = z.object({
  dependsOnStepId: z.string().min(1, '依存工程を選択してください'),
  relation: z.enum(['AND', 'OR']),
  isNegation: z.boolean(),
});

const execDependencySchema = z.object({
  dependsOnStepId: z.string().min(1, '依存工程を選択してください'),
  relation: z.enum(['AND', 'OR']),
});

const processStepSchema = z.object({
  code: z.string().min(1, 'コードを入力してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().optional(),
  category: z.enum(['MATERIAL_PREP', 'MACHINING', 'COATING', 'INSPECTION', 'APPROVAL', 'SHIPPING'], {
    message: 'カテゴリを選択してください',
  }),
  executionLocation: z.enum(['INTERNAL', 'INTERNAL_OR_OUTSOURCE'], {
    message: '実施場所を選択してください',
  }),
  isSyncCapable: z.boolean(),
  isInspection: z.boolean(),
  isApprovalStep: z.boolean(),
  approvalMinRank: z.string().optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  notes: z.string().optional(),
  useDependencies: z.array(useDependencySchema),
  execDependencies: z.array(execDependencySchema),
});

type ProcessStepFormValues = z.infer<typeof processStepSchema>;

const CATEGORY_OPTIONS = [
  { value: 'MATERIAL_PREP', label: '材料準備' },
  { value: 'MACHINING', label: '加工' },
  { value: 'COATING', label: 'コーティング' },
  { value: 'INSPECTION', label: '検査' },
  { value: 'APPROVAL', label: '検査承認' },
  { value: 'SHIPPING', label: '出荷' },
];

const EXECUTION_OPTIONS = [
  { value: 'INTERNAL', label: '社内' },
  { value: 'INTERNAL_OR_OUTSOURCE', label: '社内・外注' },
];

const RELATION_OPTIONS = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];

const EMPTY_VALUES: ProcessStepFormValues = {
  code: '',
  nameJa: '',
  nameEn: '',
  category: 'MACHINING',
  executionLocation: 'INTERNAL',
  isSyncCapable: false,
  isInspection: false,
  isApprovalStep: false,
  approvalMinRank: '',
  sortOrder: 0,
  isActive: true,
  notes: '',
  useDependencies: [],
  execDependencies: [],
};

// ── Reusable form (shared by new / edit) ─────────────────────────────────────
export function ProcessStepForm({
  mode,
  initialValues,
}: {
  mode: 'new' | 'edit';
  initialValues?: ProcessStepFormValues;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ProcessStepFormValues>({
    validate: zodResolver(processStepSchema),
    initialValues: initialValues ?? EMPTY_VALUES,
  });

  const handleSubmit = (values: ProcessStepFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({
          title: '保存しました',
          message: mode === 'new' ? '工程を登録しました' : '工程を更新しました',
          color: 'green',
        });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '工程マスタ', mode === 'new' ? '新規作成' : '編集']}
      title={mode === 'new' ? '工程マスタ 新規作成' : '工程マスタ 編集'}
      status={mode === 'edit' ? <ActiveBadge active={form.values.isActive} /> : undefined}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      {/* ── Section 1: 基本情報 ─────────────────────────────────────── */}
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput label="コード" placeholder="CYLINDER_MACHINING" withAsterisk {...form.getInputProps('code')} />
          <NumberInput label="表示順" min={0} {...form.getInputProps('sortOrder')} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          placeholder="円筒加工"
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
          <Select label="カテゴリ" placeholder="カテゴリを選択" data={CATEGORY_OPTIONS} withAsterisk {...form.getInputProps('category')} />
          <Select label="実施場所" placeholder="実施場所を選択" data={EXECUTION_OPTIONS} withAsterisk {...form.getInputProps('executionLocation')} />
          <TextInput
            label="承認必要役職"
            placeholder="係長以上"
            description="検査承認工程の場合に指定"
            {...form.getInputProps('approvalMinRank')}
          />
        </SimpleGrid>

        <Group gap="xl" mt="md">
          <Switch label="同期可" description="他工程と同時実施・記録" {...form.getInputProps('isSyncCapable', { type: 'checkbox' })} />
          <Switch label="検査工程" {...form.getInputProps('isInspection', { type: 'checkbox' })} />
          <Switch label="検査承認工程" {...form.getInputProps('isApprovalStep', { type: 'checkbox' })} />
          <Switch label="有効" {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </Group>

        <Textarea label="備考" placeholder="備考・特記事項" mt="md" rows={2} {...form.getInputProps('notes')} />
      </FormSection>

      {/* ── Dependency hint ─────────────────────────────────────────── */}
      <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
        <Text size="sm">
          <Text span fw={600}>使用依存</Text>＝ワークフローに含めてよい条件（例: 円筒加工は円筒加工検査・検査承認を含むこと）。
          <br />
          <Text span fw={600}>実行依存</Text>＝この工程を開始してよい条件（前工程の完了）。
        </Text>
      </Alert>

      {/* ── Section 2: 使用依存 ─────────────────────────────────────── */}
      <FormSection title="使用依存">
        <DependencyEditor form={form} field="useDependencies" withNegation isMobile={isMobile} />
      </FormSection>

      {/* ── Section 3: 実行依存 ─────────────────────────────────────── */}
      <FormSection title="実行依存">
        <DependencyEditor form={form} field="execDependencies" withNegation={false} isMobile={isMobile} />
      </FormSection>
    </FormShell>
  );
}

// ── Dependency editor (shared by 使用依存 / 実行依存) ─────────────────────────
function DependencyEditor({
  form,
  field,
  withNegation,
  isMobile,
}: {
  form: UseFormReturnType<
    ProcessStepFormValues,
    ProcessStepFormValues,
    (values: ProcessStepFormValues) => FormErrors
  >;
  field: 'useDependencies' | 'execDependencies';
  withNegation: boolean;
  isMobile: boolean;
}) {
  const rows = form.values[field];

  const addRow = () => {
    if (field === 'useDependencies') {
      form.insertListItem(field, { dependsOnStepId: '', relation: 'AND', isNegation: false });
    } else {
      form.insertListItem(field, { dependsOnStepId: '', relation: 'AND' });
    }
  };

  return (
    <>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">依存はありません。</Text>
      ) : isMobile ? (
        <Stack gap="sm">
          {rows.map((_row, index) => (
            <Paper key={index} withBorder p="sm" radius="sm">
              <Stack gap="xs">
                <Select
                  label="依存工程"
                  placeholder="工程を選択"
                  data={PROCESS_STEPS}
                  searchable
                  withAsterisk
                  {...form.getInputProps(`${field}.${index}.dependsOnStepId`)}
                />
                <Select
                  label="関係"
                  data={RELATION_OPTIONS}
                  {...form.getInputProps(`${field}.${index}.relation`)}
                />
                {withNegation && (
                  <Switch
                    label="排他条件"
                    {...form.getInputProps(`${field}.${index}.isNegation`, { type: 'checkbox' })}
                  />
                )}
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconMinus size={12} />}
                  onClick={() => form.removeListItem(field, index)}
                >
                  この依存を削除
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Table withTableBorder withColumnBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ minWidth: 220 }}>依存工程</Table.Th>
              <Table.Th style={{ width: 110 }}>関係</Table.Th>
              {withNegation && <Table.Th style={{ width: 110 }}>排他条件</Table.Th>}
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((_row, index) => (
              <Table.Tr key={index}>
                <Table.Td>
                  <Select
                    placeholder="工程を選択"
                    data={PROCESS_STEPS}
                    searchable
                    withAsterisk
                    {...form.getInputProps(`${field}.${index}.dependsOnStepId`)}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={RELATION_OPTIONS}
                    {...form.getInputProps(`${field}.${index}.relation`)}
                  />
                </Table.Td>
                {withNegation && (
                  <Table.Td>
                    <Switch
                      {...form.getInputProps(`${field}.${index}.isNegation`, { type: 'checkbox' })}
                    />
                  </Table.Td>
                )}
                <Table.Td>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    px={4}
                    onClick={() => form.removeListItem(field, index)}
                    aria-label="この行を削除"
                  >
                    <IconMinus size={14} />
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Button
        variant="subtle"
        leftSection={<IconPlus size={14} />}
        mt="sm"
        size="sm"
        fullWidth={isMobile}
        onClick={addRow}
      >
        依存を追加
      </Button>
    </>
  );
}

export type { ProcessStepFormValues };

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProcessStepNewPage() {
  return <ProcessStepForm mode="new" />;
}
