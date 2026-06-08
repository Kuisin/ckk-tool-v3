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
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { FormErrors } from '@mantine/form';
import { useTransition } from 'react';
import { z } from 'zod';
import { PageHeader } from '../../lib/ui';
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

const groupSchema = z.object({
  type: z.enum(['FIRST', 'SECOND', 'WORKFLOW_CHANGE'], { message: '種別を選択してください' }),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  isActive: z.boolean(),
  memberIds: z.array(z.string()).min(1, '承認者を1名以上選択してください'),
});

type FormValues = z.infer<typeof groupSchema>;

export default function ApprovalGroupNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(groupSchema),
    initialValues: {
      type: 'FIRST',
      nameJa: '',
      nameEn: '',
      isActive: true,
      memberIds: [],
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '承認グループを作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '承認グループ', '新規作成']}
        title="承認グループ 新規作成"
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
