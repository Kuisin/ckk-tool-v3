'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
  Select,
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
import { MATERIAL_TYPES, UNITS } from '../../lib/mock';
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

const FORM_OPTIONS = [
  { value: 'POLISHED', label: '研磨' },
  { value: 'STANDARD_LENGTH', label: '定尺' },
  { value: 'SEMI_FINISHED', label: '半製品' },
  { value: 'OTHER', label: 'その他' },
];

const materialSchema = z.object({
  code: z
    .string()
    .regex(
      /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/,
      '形式は [材種]-[A-C][0-9]{3}-[0-9]{3} で入力してください',
    ),
  materialTypeId: z.string().min(1, '材種を選択してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  unit: z.string().min(1, '単位を選択してください'),
  form: z.enum(['POLISHED', 'STANDARD_LENGTH', 'SEMI_FINISHED', 'OTHER']),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof materialSchema>;

export default function MaterialEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(materialSchema),
    initialValues: {
      code: 'A01A0001-A001-001',
      materialTypeId: 'A01A0001',
      nameJa: 'SUS303 φ20×3000',
      nameEn: 'SUS303 φ20×3000',
      unit: '本',
      form: 'POLISHED',
      isActive: true,
      notes: '快削ステンレス。研磨済み丸棒。',
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '素材を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '素材', form.values.code, '編集']}
        title="素材 編集"
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
                label="素材コード"
                description="形式: [材種]-[A-C][0-9]{3}-[0-9]{3}"
                withAsterisk
                {...form.getInputProps('code')}
              />
              <Select
                label="材種"
                data={MATERIAL_TYPES}
                searchable
                withAsterisk
                {...form.getInputProps('materialTypeId')}
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
              <Select
                label="単位"
                data={UNITS}
                withAsterisk
                {...form.getInputProps('unit')}
              />
              <Select
                label="形態"
                data={FORM_OPTIONS}
                withAsterisk
                {...form.getInputProps('form')}
              />
            </SimpleGrid>

            <Switch
              label="有効"
              mt="md"
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />

            <Textarea
              label="備考"
              mt="sm"
              rows={3}
              {...form.getInputProps('notes')}
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
