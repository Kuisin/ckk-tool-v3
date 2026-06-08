'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  FileButton,
  Group,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconUpload } from '@tabler/icons-react';
import { z } from 'zod';
import { formatMoney } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { StatusBadge } from '../../lib/status';
import { FormSection, FormShell } from '../../lib/shells';
import { BRANCHES, CUSTOMERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const schema = z.object({
  quoteId: z.string().nullable(),
  customerId: z.string().min(1, '顧客を選択してください'),
  customerBranchId: z.string().nullable(),
  customerOrderRef: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const QUOTE_OPTIONS = [
  { value: 'q1', label: 'QOT-202606-00001 — 株式会社ABC製作所' },
  { value: 'q2', label: 'QOT-202606-00002 — 合同会社XYZ工業' },
];

const COMPUTED_TOTAL = 281000;

export default function OrderAcceptanceEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [orderDocFile, setOrderDocFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      quoteId: 'q1',
      customerId: 'bp-001',
      customerBranchId: 'bp-001-t',
      customerOrderRef: 'PO-ABC-2026-0512',
      notes: '',
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values, orderDocFile);
        notifications.show({ title: '保存しました', message: '注文受諾書を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const branchOptions = form.values.customerId ? (BRANCHES[form.values.customerId] ?? []) : [];

  return (
    <FormShell
      breadcrumbs={['ホーム', '販売', '注文受諾書', '編集']}
      title="注文受諾書 編集"
      status={<StatusBadge entity="OrderAcceptance" status="CONFIRMED" />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="見積書" placeholder="関連する見積書を選択（任意）" data={QUOTE_OPTIONS} searchable clearable
            {...form.getInputProps('quoteId')} />
          <TextInput label="顧客注文書番号" placeholder="FAX等で受領した注文書番号"
            {...form.getInputProps('customerOrderRef')} />
          <Select label="顧客" placeholder="顧客を選択" data={CUSTOMERS} searchable withAsterisk
            {...form.getInputProps('customerId')}
            onChange={(value) => {
              form.setFieldValue('customerId', value ?? '');
              form.setFieldValue('customerBranchId', null);
            }} />
          <Select label="支店"
            placeholder={form.values.customerId ? '支店を選択' : '顧客を先に選択'}
            data={branchOptions}
            disabled={!form.values.customerId || branchOptions.length === 0}
            clearable {...form.getInputProps('customerBranchId')} />
        </SimpleGrid>
        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="注文書 PDF">
        <Group align="center" gap="sm">
          <FileButton onChange={setOrderDocFile} accept="application/pdf">
            {(props) => (
              <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                注文書を再アップロード
              </Button>
            )}
          </FileButton>
          <Text size="sm" c={orderDocFile ? undefined : 'dimmed'}>
            {orderDocFile ? orderDocFile.name : 'order-ABC-2026-0512.pdf'}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          受領した注文書 PDF は SeaweedFS に保存され files テーブルで参照されます。
        </Text>
      </FormSection>

      <FormSection title="合計金額">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">合計金額（自動計算・手動編集不可）</Text>
          <Text fw={700} size="lg" ff="mono">{formatMoney(COMPUTED_TOTAL)}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
