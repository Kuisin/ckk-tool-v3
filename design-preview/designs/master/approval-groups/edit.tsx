'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { FormErrors } from '@mantine/form';
import { IconCalendar, IconMinus, IconPlus } from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import { ActiveBadge, PageHeader } from '../../lib/ui';
import { USER_OPTIONS } from '../../lib/mock';
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

const TYPE_OPTIONS = [
  { value: 'FIRST', label: '第一承認' },
  { value: 'SECOND', label: '第二承認' },
  { value: 'WORKFLOW_CHANGE', label: '製造変更承認' },
];

const delegateSchema = z.object({
  delegatorId: z.string().min(1, '原承認者を選択してください'),
  delegateId: z.string().min(1, '代理者を選択してください'),
  validFrom: z.date().nullable(),
  validUntil: z.date().nullable(),
  reason: z.string().optional(),
});

const groupSchema = z.object({
  type: z.enum(['FIRST', 'SECOND', 'WORKFLOW_CHANGE'], { message: '種別を選択してください' }),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  isActive: z.boolean(),
  memberIds: z.array(z.string()).min(1, '承認者を1名以上選択してください'),
  delegates: z.array(delegateSchema),
});

type FormValues = z.infer<typeof groupSchema>;

const emptyDelegate = (): FormValues['delegates'][number] => ({
  delegatorId: '',
  delegateId: '',
  validFrom: null,
  validUntil: null,
  reason: '',
});

// ── Prefilled mock (edit) ─────────────────────────────────────────────────────
const INITIAL: FormValues = {
  type: 'FIRST',
  nameJa: '生産判断グループ',
  nameEn: 'Production Decision Group',
  isActive: true,
  memberIds: ['sato', 'yamada', 'ito'],
  delegates: [
    {
      delegatorId: 'sato',
      delegateId: 'ito',
      validFrom: new Date('2026-06-01'),
      validUntil: new Date('2026-06-14'),
      reason: '出張のため',
    },
  ],
};

export default function ApprovalGroupEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(groupSchema),
    initialValues: INITIAL,
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '承認グループを更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '承認グループ', '編集']}
        title="承認グループ 編集"
        status={<ActiveBadge active={form.values.isActive} />}
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          {/* ── Section 1: グループ情報 ─────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">グループ情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="種別"
                placeholder="種別を選択"
                data={TYPE_OPTIONS}
                withAsterisk
                {...form.getInputProps('type')}
              />
              <Switch
                label="有効"
                mt={isMobile ? 0 : 'xl'}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
              <TextInput
                label="名称（日本語）"
                placeholder="生産判断グループ"
                withAsterisk
                {...form.getInputProps('nameJa')}
              />
              <TextInput
                label="名称（英語）"
                placeholder="Production Decision Group"
                withAsterisk
                {...form.getInputProps('nameEn')}
              />
            </SimpleGrid>
          </Paper>

          {/* ── Section 2: メンバー ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">メンバー</Title>
            <Divider mb="md" />
            <MultiSelect
              label="承認者"
              placeholder="承認者を選択"
              data={USER_OPTIONS}
              searchable
              clearable
              withAsterisk
              {...form.getInputProps('memberIds')}
            />
          </Paper>

          {/* ── Section 3: 代理設定 ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">代理設定</Title>
            <Divider mb="md" />

            {form.values.delegates.length === 0 ? (
              <Text size="sm" c="dimmed">代理設定はありません</Text>
            ) : isMobile ? (
              <Stack gap="sm">
                {form.values.delegates.map((_d, index) => (
                  <Paper key={index} withBorder p="sm" radius="sm">
                    <Stack gap="xs">
                      <Select
                        label="原承認者"
                        placeholder="原承認者を選択"
                        data={USER_OPTIONS}
                        searchable
                        withAsterisk
                        {...form.getInputProps(`delegates.${index}.delegatorId`)}
                      />
                      <Select
                        label="代理者"
                        placeholder="代理者を選択"
                        data={USER_OPTIONS}
                        searchable
                        withAsterisk
                        {...form.getInputProps(`delegates.${index}.delegateId`)}
                      />
                      <Group grow gap="xs">
                        <DatePickerInput
                          label="開始"
                          placeholder="日付を選択"
                          leftSection={<IconCalendar size={14} />}
                          valueFormat="YYYY/MM/DD"
                          clearable
                          {...form.getInputProps(`delegates.${index}.validFrom`)}
                        />
                        <DatePickerInput
                          label="終了"
                          placeholder="日付を選択"
                          leftSection={<IconCalendar size={14} />}
                          valueFormat="YYYY/MM/DD"
                          clearable
                          {...form.getInputProps(`delegates.${index}.validUntil`)}
                        />
                      </Group>
                      <Textarea
                        label="理由"
                        placeholder="代理の理由"
                        rows={2}
                        {...form.getInputProps(`delegates.${index}.reason`)}
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        leftSection={<IconMinus size={12} />}
                        onClick={() => form.removeListItem('delegates', index)}
                      >
                        この代理設定を削除
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Table withColumnBorders={false} withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 160 }}>原承認者</Table.Th>
                    <Table.Th style={{ minWidth: 160 }}>代理者</Table.Th>
                    <Table.Th style={{ width: 150 }}>開始</Table.Th>
                    <Table.Th style={{ width: 150 }}>終了</Table.Th>
                    <Table.Th style={{ minWidth: 160 }}>理由</Table.Th>
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.values.delegates.map((_d, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Select
                          placeholder="原承認者"
                          data={USER_OPTIONS}
                          searchable
                          withAsterisk
                          {...form.getInputProps(`delegates.${index}.delegatorId`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          placeholder="代理者"
                          data={USER_OPTIONS}
                          searchable
                          withAsterisk
                          {...form.getInputProps(`delegates.${index}.delegateId`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <DatePickerInput
                          placeholder="開始"
                          valueFormat="YYYY/MM/DD"
                          clearable
                          {...form.getInputProps(`delegates.${index}.validFrom`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <DatePickerInput
                          placeholder="終了"
                          valueFormat="YYYY/MM/DD"
                          clearable
                          {...form.getInputProps(`delegates.${index}.validUntil`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          placeholder="理由"
                          {...form.getInputProps(`delegates.${index}.reason`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          px={4}
                          onClick={() => form.removeListItem('delegates', index)}
                          aria-label="この代理設定を削除"
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
              onClick={() => form.insertListItem('delegates', emptyDelegate())}
            >
              代理追加
            </Button>
          </Paper>

          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>保存</Button>
              <Button variant="default" fullWidth>キャンセル</Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default">キャンセル</Button>
              <Button type="submit" loading={isPending}>保存</Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
