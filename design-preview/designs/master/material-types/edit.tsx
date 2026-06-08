'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { FormErrors } from '@mantine/form';
import { useTransition } from 'react';
import { z } from 'zod';
import { ActiveBadge, PageHeader } from '../../lib/ui';
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

const materialTypeSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z][0-9]{2}[A-Z][0-9]{4}$/, '形式は [A-Z][0-9]{2}[A-Z][0-9]{4} で入力してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  descriptionJa: z.string().optional(),
  descriptionEn: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof materialTypeSchema>;

export default function MaterialTypeEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(materialTypeSchema),
    initialValues: {
      code: 'A01A0001',
      nameJa: 'SUS303',
      nameEn: 'SUS303',
      descriptionJa: 'オーステナイト系ステンレス鋼（快削）',
      descriptionEn: 'Free-machining austenitic stainless steel',
      isActive: true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '材種を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '材種', form.values.code, '編集']}
        title="材種 編集"
        status={<ActiveBadge active={form.values.isActive} />}
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="材種コード"
                description="形式: [A-Z][0-9]{2}[A-Z][0-9]{4}"
                withAsterisk
                {...form.getInputProps('code')}
              />
              <Switch
                label="有効"
                mt={isMobile ? 0 : 'xl'}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
              <TextInput
                label="名称（日本語）"
                withAsterisk
                {...form.getInputProps('nameJa')}
              />
              <TextInput
                label="名称（英語）"
                withAsterisk
                {...form.getInputProps('nameEn')}
              />
            </SimpleGrid>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">説明</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Textarea
                label="説明（日本語）"
                rows={3}
                {...form.getInputProps('descriptionJa')}
              />
              <Textarea
                label="説明（英語）"
                rows={3}
                {...form.getInputProps('descriptionEn')}
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
