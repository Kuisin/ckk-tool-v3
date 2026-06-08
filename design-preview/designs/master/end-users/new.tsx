'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
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
  industry: '',
  notes: '',
};

// ── Reusable form body (shared with edit.tsx) ────────────────────────────────
export function EndUserFormBody({
  initialValues = INITIAL_VALUES,
}: {
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
    <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
      <LoadingOverlay visible={isPending} />

      <Stack gap="md">
        {/* ── Section 1: 基本情報 ──────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">基本情報</Title>
          <Divider mb="md" />
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput label="名称（日本語）" placeholder="○○重工業株式会社" withAsterisk {...form.getInputProps('nameJa')} />
            <TextInput label="名称（英語）" placeholder="○○ Heavy Industries Co., Ltd." withAsterisk {...form.getInputProps('nameEn')} />
            <TextInput label="読み仮名" placeholder="まるまるじゅうこうぎょう..." {...form.getInputProps('nameKana')} />
            <Select label="国コード" placeholder="国を選択" data={COUNTRY_OPTIONS} searchable clearable {...form.getInputProps('countryCode')} />
            <TextInput label="略称（日本語）" placeholder="○○重工" {...form.getInputProps('shortNameJa')} />
            <TextInput label="略称（英語）" placeholder="○○ HI" {...form.getInputProps('shortNameEn')} />
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

        {/* ── Section 2: 需要家属性 ────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">需要家属性</Title>
          <Divider mb="md" />
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput label="業種" placeholder="自動車部品 / 産業機械 など" {...form.getInputProps('industry')} />
          </SimpleGrid>
          <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
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
export default function EndUserNewPage() {
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', 'マスタ', '最終需要家', '新規作成']} title="最終需要家 新規作成" />
      <EndUserFormBody />
    </Stack>
  );
}
