/**
 * add-contact.tsx — 担当者追加ポップアップ（顧客詳細から）
 *
 * Controlled modal: quick-create a bp_contacts row for the customer.
 * Built on the unified FormModal scaffold (lib/modals) + @mantine/form.
 */

import {
  Checkbox,
  Group,
  SimpleGrid,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { useIsMobile } from '../../../lib/viewport-context';

const contactSchema = z.object({
  name: z.string().min(1, '氏名を入力してください'),
  nameKana: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').or(z.literal('')).optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const INITIAL: ContactFormValues = {
  name: '', nameKana: '', department: '', title: '', email: '', phone: '', isPrimary: false,
};

export function AddContactModal({ opened, onClose }: ModalBaseProps) {
  const isMobile = useIsMobile();
  const form = useForm<ContactFormValues>({
    validate: zodResolver(contactSchema),
    initialValues: INITIAL,
  });

  const handleSubmit = (_values: ContactFormValues) => {
    form.reset();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="担当者を追加"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
        <TextInput label="氏名" placeholder="高橋 健" withAsterisk {...form.getInputProps('name')} />
        <TextInput label="読み仮名" placeholder="たかはし けん" {...form.getInputProps('nameKana')} />
        <TextInput label="部署" placeholder="購買部" {...form.getInputProps('department')} />
        <TextInput label="役職" placeholder="課長" {...form.getInputProps('title')} />
        <TextInput label="メール" placeholder="takahashi@example.com" {...form.getInputProps('email')} />
        <TextInput label="電話" placeholder="03-1234-5680" {...form.getInputProps('phone')} />
      </SimpleGrid>
      <Group>
        <Checkbox label="主担当に設定する" {...form.getInputProps('isPrimary', { type: 'checkbox' })} />
      </Group>
    </FormModal>
  );
}
