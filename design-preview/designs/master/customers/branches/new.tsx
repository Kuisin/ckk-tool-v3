'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
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
import { FieldValue, PageHeader } from '../../../lib/ui';
import { useIsMobile } from '../../../lib/viewport-context';

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
  nameJa: '',
  nameEn: '',
  nameKana: '',
  postalCode: '',
  addressJa: '',
  addressEn: '',
  phone: '',
  fax: '',
  email: '',
  contact: '',
  isActive: true,
};

// ── Reusable form body (shared with branches/edit.tsx) ───────────────────────
export function BranchFormBody({
  initialValues = INITIAL_VALUES,
}: {
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
    <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
      <LoadingOverlay visible={isPending} />

      <Stack gap="md">
        <Paper withBorder p="md" radius="md">
          <Title order={4} mb="xs">支店情報</Title>
          <Divider mb="md" />

          {/* Parent customer — read-only */}
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mb="md">
            <FieldValue label="親法人（顧客）" value={`${PARENT_CUSTOMER.name}（${PARENT_CUSTOMER.bpCode}）`} />
          </SimpleGrid>

          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput label="支店名（日本語）" placeholder="東京本社" withAsterisk {...form.getInputProps('nameJa')} />
            <TextInput label="支店名（英語）" placeholder="Tokyo HQ" withAsterisk {...form.getInputProps('nameEn')} />
            <TextInput label="読み仮名" placeholder="とうきょうほんしゃ" {...form.getInputProps('nameKana')} />
            <TextInput label="郵便番号" placeholder="108-0075" {...form.getInputProps('postalCode')} />
            <TextInput label="電話" placeholder="03-1234-5678" {...form.getInputProps('phone')} />
            <TextInput label="FAX" placeholder="03-1234-5679" {...form.getInputProps('fax')} />
            <TextInput label="メール" placeholder="branch@example.com" {...form.getInputProps('email')} />
            <TextInput label="担当者" placeholder="高橋 健" {...form.getInputProps('contact')} />
          </SimpleGrid>

          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mt="sm">
            <Textarea label="住所（日本語）" placeholder="東京都..." rows={2} {...form.getInputProps('addressJa')} />
            <Textarea label="住所（英語）" placeholder="Tokyo..." rows={2} {...form.getInputProps('addressEn')} />
          </SimpleGrid>

          <Switch label="有効" mt="md" {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </Paper>

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
export default function BranchNewPage() {
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '顧客', PARENT_CUSTOMER.name, '支店', '新規作成']}
        title="支店 新規作成"
      />
      <BranchFormBody />
    </Stack>
  );
}
