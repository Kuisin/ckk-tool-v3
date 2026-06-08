'use client';

import { useTransition } from 'react';
import { Select, SimpleGrid, Switch, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { MATERIAL_TYPES, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

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

export default function MaterialNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(materialSchema),
    initialValues: {
      code: '',
      materialTypeId: '',
      nameJa: '',
      nameEn: '',
      unit: '本',
      form: 'POLISHED',
      isActive: true,
      notes: '',
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '素材を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '素材', '新規作成']}
      title="素材 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mb="sm">
          <TextInput
            label="素材コード"
            placeholder="A01A0001-A001-001"
            description="形式: [材種]-[A-C][0-9]{3}-[0-9]{3}"
            withAsterisk
            {...form.getInputProps('code')}
          />
          <Select
            label="材種" placeholder="材種を選択" data={MATERIAL_TYPES} searchable withAsterisk
            {...form.getInputProps('materialTypeId')}
          />
          <Select label="単位" data={UNITS} withAsterisk {...form.getInputProps('unit')} />
          <Select label="形態" data={FORM_OPTIONS} withAsterisk {...form.getInputProps('form')} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          placeholder="SUS303 φ20×3000"
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
        <Switch label="有効" mt="md" {...form.getInputProps('isActive', { type: 'checkbox' })} />
        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>
    </FormShell>
  );
}
