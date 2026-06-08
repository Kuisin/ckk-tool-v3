/**
 * add-contact.tsx — 担当者追加ポップアップ（bp_contacts）
 *
 * Controlled FormModal opened from the supplier detail 担当者 section.
 * Uses the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { SimpleGrid, Switch, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { useIsMobile } from '../../../lib/viewport-context';

const contactSchema = z.object({
  name: z.string().min(1, '氏名を入力してください'),
  nameKana: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').or(z.literal('')).optional(),
  isPrimary: z.boolean(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const EMPTY: ContactFormValues = {
  name: '',
  nameKana: '',
  department: '',
  title: '',
  phone: '',
  email: '',
  isPrimary: false,
};

export function AddContactModal({ opened, onClose }: ModalBaseProps) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ContactFormValues>({
    validate: zodResolver(contactSchema),
    initialValues: EMPTY,
  });

  const handleSubmit = (values: ContactFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting contact:', values);
        notifications.show({ title: '保存しました', message: '担当者を追加しました', color: 'green' });
        form.reset();
        onClose();
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="担当者の追加"
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="追加"
      loading={isPending}
    >
      <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
        <TextInput label="氏名" placeholder="小林 健" withAsterisk {...form.getInputProps('name')} />
        <TextInput label="読み仮名" placeholder="こばやし けん" {...form.getInputProps('nameKana')} />
        <TextInput label="部署" placeholder="営業部" {...form.getInputProps('department')} />
        <TextInput label="役職" placeholder="営業課長" {...form.getInputProps('title')} />
        <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
        <TextInput label="メール" placeholder="info@example.co.jp" {...form.getInputProps('email')} />
      </SimpleGrid>
      <Switch label="主担当に設定" {...form.getInputProps('isPrimary', { type: 'checkbox' })} />
    </FormModal>
  );
}
