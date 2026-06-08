'use client';

import { useTransition } from 'react';
import { NumberInput, SimpleGrid, Switch, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

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
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '不良種類', '新規作成']}
      title="不良種類 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput label="コード" placeholder="DIM" withAsterisk {...form.getInputProps('code')} />
          <NumberInput label="表示順" min={0} {...form.getInputProps('sortOrder')} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
        <Switch label="有効" mt="sm" {...form.getInputProps('isActive', { type: 'checkbox' })} />
      </FormSection>
    </FormShell>
  );
}
