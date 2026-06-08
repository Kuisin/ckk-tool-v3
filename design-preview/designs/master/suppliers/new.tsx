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

// ── Zod schema ───────────────────────────────────────────────────────────────
const supplierSchema = z.object({
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().optional(),
  nameKana: z.string().optional(),
  shortName: z.string().optional(),
  countryCode: z.string().optional(),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email('メールアドレスの形式が正しくありません').or(z.literal('')).optional(),
  isActive: z.boolean(),
  // bp_vendor_attrs
  vendorCode: z.string().optional(),
  vendorType: z.enum(['SUPPLIER', 'OUTSOURCE'], { message: '種別を選択してください' }),
  closingDay: z.number().int().min(1).max(31).nullable(),
  paymentTermsDays: z.number().int().min(0).nullable(),
  paymentDay: z.number().int().min(1).max(31).nullable(),
  leadTimeDays: z.number().int().min(0).nullable(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccountType: z.string().nullable(),
  bankAccountNumber: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

const VENDOR_TYPE_OPTIONS = [
  { value: 'SUPPLIER', label: '仕入先' },
  { value: 'OUTSOURCE', label: '外注先' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: '普通', label: '普通' },
  { value: '当座', label: '当座' },
];

const EMPTY_VALUES: SupplierFormValues = {
  nameJa: '',
  nameEn: '',
  nameKana: '',
  shortName: '',
  countryCode: 'JP',
  postalCode: '',
  addressJa: '',
  addressEn: '',
  phone: '',
  fax: '',
  email: '',
  isActive: true,
  vendorCode: '',
  vendorType: 'OUTSOURCE',
  closingDay: null,
  paymentTermsDays: null,
  paymentDay: null,
  leadTimeDays: null,
  bankName: '',
  bankBranch: '',
  bankAccountType: null,
  bankAccountNumber: '',
};

// ── Reusable form (shared by new / edit) ─────────────────────────────────────
export function SupplierForm({
  mode,
  initialValues,
}: {
  mode: 'new' | 'edit';
  initialValues?: SupplierFormValues;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<SupplierFormValues>({
    validate: zodResolver(supplierSchema),
    initialValues: initialValues ?? EMPTY_VALUES,
  });

  const handleSubmit = (values: SupplierFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({
          title: '保存しました',
          message: mode === 'new' ? '外注企業を登録しました' : '外注企業を更新しました',
          color: 'green',
        });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '外注企業', mode === 'new' ? '新規作成' : '編集']}
        title={mode === 'new' ? '外注企業 新規作成' : '外注企業 編集'}
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          {/* ── Section 1: 基本情報 ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="名称（日本語）"
                placeholder="外注研磨株式会社"
                withAsterisk
                {...form.getInputProps('nameJa')}
              />
              <TextInput
                label="名称（英語）"
                placeholder="Gaichu Polishing Co., Ltd."
                {...form.getInputProps('nameEn')}
              />
              <TextInput
                label="読み仮名"
                placeholder="がいちゅうけんま"
                {...form.getInputProps('nameKana')}
              />
              <TextInput
                label="略称"
                placeholder="外注研磨"
                {...form.getInputProps('shortName')}
              />
              <TextInput
                label="国コード"
                placeholder="JP"
                {...form.getInputProps('countryCode')}
              />
              <TextInput
                label="郵便番号"
                placeholder="123-4567"
                {...form.getInputProps('postalCode')}
              />
              <TextInput
                label="住所（日本語）"
                placeholder="東京都大田区…"
                {...form.getInputProps('addressJa')}
              />
              <TextInput
                label="住所（英語）"
                placeholder="Ota-ku, Tokyo…"
                {...form.getInputProps('addressEn')}
              />
              <TextInput
                label="電話"
                placeholder="03-1234-5678"
                {...form.getInputProps('phone')}
              />
              <TextInput
                label="FAX"
                placeholder="03-1234-5679"
                {...form.getInputProps('fax')}
              />
              <TextInput
                label="メール"
                placeholder="info@example.co.jp"
                {...form.getInputProps('email')}
              />
            </SimpleGrid>
            <Switch
              label="有効"
              mt="md"
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />
          </Paper>

          {/* ── Section 2: 取引条件 ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">取引条件</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="仕入先コード"
                placeholder="V-00021"
                {...form.getInputProps('vendorCode')}
              />
              <Select
                label="種別"
                placeholder="種別を選択"
                data={VENDOR_TYPE_OPTIONS}
                withAsterisk
                {...form.getInputProps('vendorType')}
              />
              <NumberInput
                label="締日"
                placeholder="31（月末）"
                min={1}
                max={31}
                {...form.getInputProps('closingDay')}
              />
              <NumberInput
                label="支払サイト（日数）"
                placeholder="60"
                min={0}
                suffix=" 日"
                {...form.getInputProps('paymentTermsDays')}
              />
              <NumberInput
                label="支払日"
                placeholder="末日"
                min={1}
                max={31}
                {...form.getInputProps('paymentDay')}
              />
              <NumberInput
                label="標準リードタイム（日数）"
                placeholder="7"
                min={0}
                suffix=" 日"
                {...form.getInputProps('leadTimeDays')}
              />
            </SimpleGrid>
          </Paper>

          {/* ── Section 3: 振込先 ───────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">振込先</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="銀行名"
                placeholder="○○銀行"
                {...form.getInputProps('bankName')}
              />
              <TextInput
                label="支店"
                placeholder="△△支店"
                {...form.getInputProps('bankBranch')}
              />
              <Select
                label="口座種別"
                placeholder="口座種別を選択"
                data={ACCOUNT_TYPE_OPTIONS}
                clearable
                {...form.getInputProps('bankAccountType')}
              />
              <TextInput
                label="口座番号"
                placeholder="1234567"
                {...form.getInputProps('bankAccountNumber')}
              />
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="sm">
              仕入先・外注先への支払時に使用します。
            </Text>
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
    </Stack>
  );
}

export type { SupplierFormValues };

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SupplierNewPage() {
  return <SupplierForm mode="new" />;
}
