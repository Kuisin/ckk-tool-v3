'use client';

import { type ReactNode, useTransition } from 'react';
import {
  Select,
  SimpleGrid,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { useIsMobile } from '../../lib/viewport-context';

// ── Constants ────────────────────────────────────────────────────────────────
const COUNTRY_OPTIONS = [
  { value: 'JP', label: '日本 (JP)' },
  { value: 'CN', label: '中国 (CN)' },
  { value: 'US', label: 'アメリカ (US)' },
  { value: 'KR', label: '韓国 (KR)' },
];

// ── Zod schema ───────────────────────────────────────────────────────────────
const endUserSchema = z.object({
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  nameKana: z.string().optional(),
  shortNameJa: z.string().optional(),
  shortNameEn: z.string().optional(),
  countryCode: z.string().nullable(),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').or(z.literal('')).optional(),
  website: z.string().optional(),
  taxNumber: z.string().optional(),
  isActive: z.boolean(),
  // bp_end_user_attrs
  industry: z.string().optional(),
  notes: z.string().optional(),
});

type EndUserFormValues = z.infer<typeof endUserSchema>;

const INITIAL_VALUES: EndUserFormValues = {
  nameJa: '', nameEn: '', nameKana: '', shortNameJa: '', shortNameEn: '',
  countryCode: 'JP', postalCode: '', addressJa: '', addressEn: '',
  phone: '', fax: '', email: '', website: '', taxNumber: '', isActive: true,
  industry: '', notes: '',
};

// ── Reusable form body (shared with edit.tsx) ────────────────────────────────
export function EndUserFormBody({
  breadcrumbs,
  title,
  status,
  initialValues = INITIAL_VALUES,
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  initialValues?: EndUserFormValues;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<EndUserFormValues>({
    validate: zodResolver(endUserSchema),
    initialValues,
  });

  const handleSubmit = (values: EndUserFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '最終需要家を登録しました', color: 'green' });
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
      <FormSection title="基本情報">
        <LocalizedTextInput
          label="名称" required placeholder="○○重工業株式会社 / ○○ Heavy Industries"
          jaProps={form.getInputProps('nameJa')} enProps={form.getInputProps('nameEn')}
        />
        <LocalizedTextInput
          label="略称" placeholder="○○重工 / ○○ HI"
          jaProps={form.getInputProps('shortNameJa')} enProps={form.getInputProps('shortNameEn')}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
          <TextInput label="読み仮名" placeholder="まるまるじゅうこうぎょう..." {...form.getInputProps('nameKana')} />
          <Select label="国コード" placeholder="国を選択" data={COUNTRY_OPTIONS} searchable clearable {...form.getInputProps('countryCode')} />
          <TextInput label="郵便番号" placeholder="123-4567" {...form.getInputProps('postalCode')} />
          <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
          <TextInput label="FAX" placeholder="03-1234-5679" {...form.getInputProps('fax')} />
          <TextInput label="メール" placeholder="info@example.com" {...form.getInputProps('email')} />
          <TextInput label="ウェブサイト" placeholder="https://example.com" {...form.getInputProps('website')} />
          <TextInput label="法人番号" placeholder="1234567890123" {...form.getInputProps('taxNumber')} />
        </SimpleGrid>
        <LocalizedTextInput
          label="住所" placeholder="東京都... / Tokyo..."
          jaProps={form.getInputProps('addressJa')} enProps={form.getInputProps('addressEn')}
        />
        <Switch label="有効" mt="md" {...form.getInputProps('isActive', { type: 'checkbox' })} />
      </FormSection>

      <FormSection title="需要家属性">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput label="業種" placeholder="自動車部品 / 産業機械 など" {...form.getInputProps('industry')} />
        </SimpleGrid>
        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>
    </FormShell>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function EndUserNewPage() {
  return (
    <EndUserFormBody
      breadcrumbs={['ホーム', 'マスタ', '最終需要家', '新規作成']}
      title="最終需要家 新規作成"
    />
  );
}
