'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
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

const defectTypeSchema = z.object({
  code: z.string().min(1, 'コードを入力してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof defectTypeSchema>;

export default function DefectTypeNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(defectTypeSchema),
    initialValues: {
      code: '',
      nameJa: '',
      nameEn: '',
      sortOrder: 0,
      isActive: true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '不良種類を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '不良種類', '新規作成']}
        title="不良種類 新規作成"
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="コード"
                placeholder="DIM"
                withAsterisk
                {...form.getInputProps('code')}
              />
              <NumberInput
                label="表示順"
                min={0}
                {...form.getInputProps('sortOrder')}
              />
              <TextInput
                label="名称（日本語）"
                placeholder="寸法不良"
                withAsterisk
                {...form.getInputProps('nameJa')}
              />
              <TextInput
                label="名称（英語）"
                placeholder="Dimensional Defect"
                withAsterisk
                {...form.getInputProps('nameEn')}
              />
              <Switch
                label="有効"
                mt={isMobile ? 0 : 'xs'}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
            </SimpleGrid>
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
