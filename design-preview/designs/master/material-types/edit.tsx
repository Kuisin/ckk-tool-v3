'use client';

import { useTransition } from 'react';
import { SimpleGrid, Switch, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { ActiveBadge } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

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
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '材種', form.values.code, '編集']}
      title="材種 編集"
      status={<ActiveBadge active={form.values.isActive} />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mb="sm">
          <TextInput
            label="材種コード"
            description="形式: [A-Z][0-9]{2}[A-Z][0-9]{4}"
            withAsterisk
            {...form.getInputProps('code')}
          />
          <Switch label="有効" mt={isMobile ? 0 : 'xl'} {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
      </FormSection>

      <FormSection title="説明">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Textarea label="説明（日本語）" rows={3} {...form.getInputProps('descriptionJa')} />
          <Textarea label="説明（English）" rows={3} {...form.getInputProps('descriptionEn')} />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
