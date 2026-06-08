'use client';

import { type ReactNode, useTransition } from 'react';
import {
  NumberInput,
  Select,
  SimpleGrid,
  Switch,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Constants ────────────────────────────────────────────────────────────────
const COUNTRY_OPTIONS = [
  { value: 'JP', label: '日本 (JP)' },
  { value: 'CN', label: '中国 (CN)' },
  { value: 'US', label: 'アメリカ (US)' },
  { value: 'KR', label: '韓国 (KR)' },
];

const TAX_TYPE_OPTIONS = [
  { value: 'TAXABLE', label: '課税' },
  { value: 'EXEMPT', label: '非課税' },
  { value: 'REDUCED', label: '軽減税率' },
];

const INVOICE_METHOD_OPTIONS = [
  { value: 'EMAIL', label: 'メール' },
  { value: 'FAX', label: 'FAX' },
  { value: 'POST', label: '郵送' },
  { value: 'PORTAL', label: 'ポータル' },
];

// ── Zod schema ───────────────────────────────────────────────────────────────
const customerSchema = z.object({
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
  // bp_customer_attrs
  customerCode: z.string().optional(),
  billingBpId: z.string().nullable(),
  closingDay: z.number().int().min(1).max(31).nullable(),
  paymentTermsDays: z.number().int().min(0).nullable(),
  paymentDay: z.number().int().min(1).max(31).nullable(),
  creditLimit: z.number().min(0).nullable(),
  taxType: z.string().nullable(),
  invoiceMethod: z.string().nullable(),
  isConsignment: z.boolean(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

const INITIAL_VALUES: CustomerFormValues = {
  nameJa: '', nameEn: '', nameKana: '', shortNameJa: '', shortNameEn: '',
  countryCode: 'JP', postalCode: '', addressJa: '', addressEn: '',
  phone: '', fax: '', email: '', website: '', taxNumber: '', isActive: true,
  customerCode: '', billingBpId: null, closingDay: 31, paymentTermsDays: 30,
  paymentDay: 25, creditLimit: null, taxType: 'TAXABLE', invoiceMethod: 'EMAIL', isConsignment: false,
};

// ── Reusable form body (shared with edit.tsx) ────────────────────────────────
export function CustomerFormBody({
  breadcrumbs,
  title,
  status,
  initialValues = INITIAL_VALUES,
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  initialValues?: CustomerFormValues;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CustomerFormValues>({
    validate: zodResolver(customerSchema),
    initialValues,
  });

  const handleSubmit = (values: CustomerFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '顧客を登録しました', color: 'green' });
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
          label="名称" required placeholder="株式会社○○製作所 / ○○ Manufacturing"
          jaProps={form.getInputProps('nameJa')} enProps={form.getInputProps('nameEn')}
        />
        <LocalizedTextInput
          label="略称" placeholder="○○製作所 / ○○ Mfg."
          jaProps={form.getInputProps('shortNameJa')} enProps={form.getInputProps('shortNameEn')}
        />
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
          <TextInput label="読み仮名" placeholder="かぶしきがいしゃ..." {...form.getInputProps('nameKana')} />
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

      <FormSection title="取引条件">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput label="顧客コード" placeholder="旧システム互換コード（任意）" {...form.getInputProps('customerCode')} />
          <Select
            label="請求先" description="別法人を請求先にする場合のみ" placeholder="自社（既定）"
            data={CUSTOMERS} searchable clearable {...form.getInputProps('billingBpId')}
          />
          <NumberInput label="締日" description="1〜31（31=月末）" min={1} max={31} {...form.getInputProps('closingDay')} />
          <NumberInput label="支払サイト" description="日数" min={0} suffix=" 日" {...form.getInputProps('paymentTermsDays')} />
          <NumberInput label="支払日" min={1} max={31} {...form.getInputProps('paymentDay')} />
          <NumberInput label="与信限度額" prefix="¥" thousandSeparator="," decimalScale={2} min={0} {...form.getInputProps('creditLimit')} />
          <Select label="税区分" data={TAX_TYPE_OPTIONS} {...form.getInputProps('taxType')} />
          <Select label="請求方法" data={INVOICE_METHOD_OPTIONS} {...form.getInputProps('invoiceMethod')} />
        </SimpleGrid>
        <Switch label="委託先" mt="md" {...form.getInputProps('isConsignment', { type: 'checkbox' })} />
      </FormSection>
    </FormShell>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CustomerNewPage() {
  return (
    <CustomerFormBody
      breadcrumbs={['ホーム', 'マスタ', '顧客', '新規作成']}
      title="顧客 新規作成"
    />
  );
}
