'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm, type FormErrors } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useTransition } from 'react';
import { z } from 'zod';
import { CUSTOMERS } from '../../lib/mock';
import { PageHeader } from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

function zodResolver<T>(schema: z.ZodType<T>) {
  return (values: T): FormErrors => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return errors;
  };
}

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
  nameJa: '',
  nameEn: '',
  nameKana: '',
  shortNameJa: '',
  shortNameEn: '',
  countryCode: 'JP',
  postalCode: '',
  addressJa: '',
  addressEn: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  taxNumber: '',
  isActive: true,
  customerCode: '',
  billingBpId: null,
  closingDay: 31,
  paymentTermsDays: 30,
  paymentDay: 25,
  creditLimit: null,
  taxType: 'TAXABLE',
  invoiceMethod: 'EMAIL',
  isConsignment: false,
};

// ── Reusable form body (shared with edit.tsx) ────────────────────────────────
export function CustomerFormBody({
  initialValues = INITIAL_VALUES,
}: {
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
    <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
      <LoadingOverlay visible={isPending} />

      <Stack gap="md">
        {/* ── Section 1: 基本情報 ──────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">基本情報</Title>
          <Divider mb="md" />
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput label="名称（日本語）" placeholder="株式会社○○製作所" withAsterisk {...form.getInputProps('nameJa')} />
            <TextInput label="名称（英語）" placeholder="○○ Manufacturing Co., Ltd." withAsterisk {...form.getInputProps('nameEn')} />
            <TextInput label="読み仮名" placeholder="かぶしきがいしゃ..." {...form.getInputProps('nameKana')} />
            <Select label="国コード" placeholder="国を選択" data={COUNTRY_OPTIONS} searchable clearable {...form.getInputProps('countryCode')} />
            <TextInput label="略称（日本語）" placeholder="○○製作所" {...form.getInputProps('shortNameJa')} />
            <TextInput label="略称（英語）" placeholder="○○ Mfg." {...form.getInputProps('shortNameEn')} />
            <TextInput label="郵便番号" placeholder="123-4567" {...form.getInputProps('postalCode')} />
            <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
            <TextInput label="FAX" placeholder="03-1234-5679" {...form.getInputProps('fax')} />
            <TextInput label="メール" placeholder="info@example.com" {...form.getInputProps('email')} />
            <TextInput label="ウェブサイト" placeholder="https://example.com" {...form.getInputProps('website')} />
            <TextInput label="法人番号" placeholder="1234567890123" {...form.getInputProps('taxNumber')} />
          </SimpleGrid>
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
            <Textarea label="住所（日本語）" placeholder="東京都..." rows={2} {...form.getInputProps('addressJa')} />
            <Textarea label="住所（英語）" placeholder="Tokyo..." rows={2} {...form.getInputProps('addressEn')} />
          </SimpleGrid>
          <Switch label="有効" mt="md" {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </Paper>

        {/* ── Section 2: 取引条件 ──────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">取引条件</Title>
          <Divider mb="md" />
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput label="顧客コード" placeholder="旧システム互換コード（任意）" {...form.getInputProps('customerCode')} />
            <Select
              label="請求先"
              description="別法人を請求先にする場合のみ"
              placeholder="自社（既定）"
              data={CUSTOMERS}
              searchable
              clearable
              {...form.getInputProps('billingBpId')}
            />
            <NumberInput label="締日" description="1〜31（31=月末）" min={1} max={31} {...form.getInputProps('closingDay')} />
            <NumberInput label="支払サイト" description="日数" min={0} suffix=" 日" {...form.getInputProps('paymentTermsDays')} />
            <NumberInput label="支払日" min={1} max={31} {...form.getInputProps('paymentDay')} />
            <NumberInput
              label="与信限度額"
              prefix="¥"
              thousandSeparator=","
              decimalScale={2}
              min={0}
              {...form.getInputProps('creditLimit')}
            />
            <Select label="税区分" data={TAX_TYPE_OPTIONS} {...form.getInputProps('taxType')} />
            <Select label="請求方法" data={INVOICE_METHOD_OPTIONS} {...form.getInputProps('invoiceMethod')} />
          </SimpleGrid>
          <Switch label="委託先" mt="md" {...form.getInputProps('isConsignment', { type: 'checkbox' })} />
        </Paper>

        {/* ── Form actions ─────────────────────────────────────────────── */}
        {isMobile ? (
          <Stack gap="xs">
            <Button type="submit" loading={isPending} fullWidth>保存</Button>
            <Button variant="default" fullWidth>キャンセル</Button>
          </Stack>
        ) : (
          <Group justify="flex-end" mt="md">
            <Button variant="default">キャンセル</Button>
            <Button type="submit" loading={isPending}>保存</Button>
          </Group>
        )}
      </Stack>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CustomerNewPage() {
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', 'マスタ', '顧客', '新規作成']} title="顧客 新規作成" />
      <CustomerFormBody />
    </Stack>
  );
}
