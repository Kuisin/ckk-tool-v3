'use client';

import { useTransition } from 'react';
import {
  MultiSelect,
  Select,
  SimpleGrid,
  Switch,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { USER_OPTIONS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

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
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '承認グループ', '新規作成']}
      title="承認グループ 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="グループ情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="種別" placeholder="種別を選択" data={TYPE_OPTIONS} withAsterisk {...form.getInputProps('type')} />
          <Switch label="有効" mt={isMobile ? 0 : 'xl'} {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
      </FormSection>

      <FormSection title="メンバー">
        <MultiSelect
          label="承認者"
          placeholder="承認者を選択"
          data={USER_OPTIONS}
          searchable
          clearable
          withAsterisk
          {...form.getInputProps('memberIds')}
        />
      </FormSection>
    </FormShell>
  );
}
