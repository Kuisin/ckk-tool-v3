'use client';

import { type ReactNode, useTransition } from 'react';
import { SimpleGrid, Switch, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../../lib/shells';
import { FieldValue } from '../../../lib/ui';
import { useIsMobile } from '../../../lib/viewport-context';

// ── Parent customer (read-only context) ──────────────────────────────────────
const PARENT_CUSTOMER = { bpCode: 'BP-00001', name: '株式会社ABC製作所' };

// ── Zod schema ───────────────────────────────────────────────────────────────
const branchSchema = z.object({
  nameJa: z.string().min(1, '支店名（日本語）を入力してください'),
  nameEn: z.string().min(1, '支店名（英語）を入力してください'),
  nameKana: z.string().optional(),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').or(z.literal('')).optional(),
  contact: z.string().optional(),
  isActive: z.boolean(),
});

type BranchFormValues = z.infer<typeof branchSchema>;

const INITIAL_VALUES: BranchFormValues = {
  nameJa: '', nameEn: '', nameKana: '', postalCode: '', addressJa: '', addressEn: '',
  phone: '', fax: '', email: '', contact: '', isActive: true,
};

// ── Reusable form body (shared with branches/edit.tsx) ───────────────────────
export function BranchFormBody({
  breadcrumbs,
  title,
  status,
  initialValues = INITIAL_VALUES,
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  initialValues?: BranchFormValues;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<BranchFormValues>({
    validate: zodResolver(branchSchema),
    initialValues,
  });

  const handleSubmit = (values: BranchFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '支店を登録しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={breadcrumbs}
      title={title}
      status={status}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="支店情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mb="md">
          <FieldValue label="親法人（顧客）" value={`${PARENT_CUSTOMER.name}（${PARENT_CUSTOMER.bpCode}）`} />
        </SimpleGrid>

        <LocalizedTextInput
          label="支店名" required placeholder="東京本社 / Tokyo HQ"
          jaProps={form.getInputProps('nameJa')} enProps={form.getInputProps('nameEn')}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
          <TextInput label="読み仮名" placeholder="とうきょうほんしゃ" {...form.getInputProps('nameKana')} />
          <TextInput label="郵便番号" placeholder="108-0075" {...form.getInputProps('postalCode')} />
          <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
          <TextInput label="FAX" placeholder="03-1234-5679" {...form.getInputProps('fax')} />
          <TextInput label="メール" placeholder="branch@example.com" {...form.getInputProps('email')} />
          <TextInput label="担当者" placeholder="高橋 健" {...form.getInputProps('contact')} />
        </SimpleGrid>
        <LocalizedTextInput
          label="住所" placeholder="東京都... / Tokyo..."
          jaProps={form.getInputProps('addressJa')} enProps={form.getInputProps('addressEn')}
        />
        <Switch label="有効" mt="md" {...form.getInputProps('isActive', { type: 'checkbox' })} />
      </FormSection>
    </FormShell>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BranchNewPage() {
  return (
    <BranchFormBody
      breadcrumbs={['ホーム', 'マスタ', '顧客', PARENT_CUSTOMER.name, '支店', '新規作成']}
      title="支店 新規作成"
    />
  );
}
