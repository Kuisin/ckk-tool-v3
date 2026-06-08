/**
 * add-branch.tsx — 支店追加ポップアップ（顧客詳細から）
 *
 * Controlled modal: quick-create a 支店 (business_partners row via parent_id).
 * Built on the unified FormModal scaffold (lib/modals) + @mantine/form.
 * Uses LocalizedTextInput for the { ja, en } 支店名 / 住所 fields.
 */

import { SimpleGrid, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../../lib/modals';
import { zodResolver } from '../../../../lib/form';
import { LocalizedTextInput } from '../../../../lib/shells';
import { useIsMobile } from '../../../../lib/viewport-context';

const branchSchema = z.object({
  nameJa: z.string().min(1, '支店名（日本語）を入力してください'),
  nameEn: z.string().min(1, '支店名（英語）を入力してください'),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  contact: z.string().optional(),
});

type BranchFormValues = z.infer<typeof branchSchema>;

const INITIAL: BranchFormValues = {
  nameJa: '', nameEn: '', postalCode: '', addressJa: '', addressEn: '', phone: '', contact: '',
};

export function AddBranchModal({
  opened,
  onClose,
  parentName,
}: ModalBaseProps & { parentName?: string }) {
  const isMobile = useIsMobile();
  const form = useForm<BranchFormValues>({
    validate: zodResolver(branchSchema),
    initialValues: INITIAL,
  });

  const handleSubmit = (_values: BranchFormValues) => {
    form.reset();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={parentName ? `支店を追加 — ${parentName}` : '支店を追加'}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <LocalizedTextInput
        label="支店名"
        required
        placeholder="東京本社 / Tokyo HQ"
        jaProps={form.getInputProps('nameJa')}
        enProps={form.getInputProps('nameEn')}
      />
      <LocalizedTextInput
        label="住所"
        placeholder="東京都... / Tokyo..."
        jaProps={form.getInputProps('addressJa')}
        enProps={form.getInputProps('addressEn')}
      />
      <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
        <TextInput label="郵便番号" placeholder="108-0075" {...form.getInputProps('postalCode')} />
        <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
        <TextInput label="担当者" placeholder="高橋 健" {...form.getInputProps('contact')} />
      </SimpleGrid>
    </FormModal>
  );
}
