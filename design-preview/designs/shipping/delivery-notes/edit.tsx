'use client';

import { useTransition } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar, IconInfoCircle, IconMinus, IconPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { formatMoney } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { StatusBadge } from '../../lib/status';
import { FormSection, FormShell } from '../../lib/shells';
import { BRANCHES, CUSTOMERS, END_USERS, PRODUCTS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const SHIPPING_ORDER_OPTIONS = [
  { value: 'sh-001', label: 'SHP-202606-0007 — 株式会社ABC製作所' },
  { value: 'sh-002', label: 'SHP-202606-0006 — 合同会社XYZ工業' },
  { value: 'sh-003', label: 'SHP-202606-0004 — 株式会社DEFエンジニアリング' },
];

const deliveryItemSchema = z.object({
  productId: z.string().min(1, '製品を選択してください'),
  quantity: z.number().int().min(1, '1以上を入力してください'),
  unitPrice: z.number().min(0),
  notes: z.string().optional(),
});

const deliveryNoteSchema = z.object({
  shippingOrderId: z.string().min(1, '出荷書を選択してください'),
  deliveryMethod: z.enum(['DIRECT_TO_USER', 'NORMAL']),
  recipientId: z.string().min(1, '納品先を選択してください'),
  recipientBranchId: z.string().nullable(),
  endUserId: z.string().nullable(),
  includePrice: z.boolean(),
  deliveredAt: z.date().nullable(),
  notes: z.string().optional(),
  items: z.array(deliveryItemSchema).min(1, '明細を1件以上入力してください'),
});

type DeliveryNoteFormValues = z.infer<typeof deliveryNoteSchema>;

const EMPTY_ITEM = { productId: '', quantity: 1, unitPrice: 0, notes: '' };

export default function DeliveryNoteEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<DeliveryNoteFormValues>({
    validate: zodResolver(deliveryNoteSchema),
    initialValues: {
      shippingOrderId: 'sh-001',
      deliveryMethod: 'NORMAL',
      recipientId: 'bp-001',
      recipientBranchId: 'bp-001-t',
      endUserId: null,
      includePrice: true,
      deliveredAt: new Date('2026-06-05'),
      notes: '',
      items: [{ productId: 'PRD-2601-0001', quantity: 50, unitPrice: 5000, notes: '' }],
    },
  });

  const isDirect = form.values.deliveryMethod === 'DIRECT_TO_USER';
  const totalAmount = form.values.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const branchOptions = form.values.recipientId ? (BRANCHES[form.values.recipientId] ?? []) : [];

  const handleSubmit = (values: DeliveryNoteFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '納品書を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', '出荷', '納品書', 'DRN-202606-00012', '編集']}
      title="納品書 編集"
      status={<StatusBadge entity="DeliveryNote" status="ISSUED" />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            label="出荷書" placeholder="出荷書を選択" data={SHIPPING_ORDER_OPTIONS} searchable withAsterisk
            {...form.getInputProps('shippingOrderId')}
          />
          <Select
            label="配送方法"
            data={[
              { value: 'NORMAL', label: '通常納品' },
              { value: 'DIRECT_TO_USER', label: 'ユーザー直送' },
            ]}
            withAsterisk
            {...form.getInputProps('deliveryMethod')}
          />
          <Select
            label="納品先" placeholder="納品先を選択" data={CUSTOMERS} searchable withAsterisk
            {...form.getInputProps('recipientId')}
            onChange={(value) => {
              form.setFieldValue('recipientId', value ?? '');
              form.setFieldValue('recipientBranchId', null);
            }}
          />
          <Select
            label="納品先支店"
            placeholder={form.values.recipientId ? '支店を選択' : '納品先を先に選択'}
            data={branchOptions}
            disabled={!form.values.recipientId || branchOptions.length === 0}
            clearable
            {...form.getInputProps('recipientBranchId')}
          />
          {isDirect && (
            <Select
              label="最終需要家" placeholder="最終需要家を選択" data={END_USERS} searchable clearable
              {...form.getInputProps('endUserId')}
            />
          )}
          <DatePickerInput
            label="納品日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('deliveredAt')}
          />
        </SimpleGrid>

        <Switch
          mt="md"
          label="配送完了書に価格を記載する"
          description="納品書に単価・金額を表示します"
          {...form.getInputProps('includePrice', { type: 'checkbox' })}
        />

        {isDirect && (
          <Alert color="violet" icon={<IconInfoCircle size={16} />} mt="md" variant="light">
            ユーザー直送の場合、最終需要家へ届く配送完了書には価格を記載しません。価格付きの納品書は受注先（顧客）へ別送されます。
          </Alert>
        )}

        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="納品明細">
        {isMobile ? (
          <Stack gap="sm">
            {form.values.items.map((item, index) => (
              <Paper key={index} withBorder p="sm" radius="sm">
                <Stack gap="xs">
                  <Select label="製品" placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
                    {...form.getInputProps(`items.${index}.productId`)} />
                  <Group grow gap="xs">
                    <NumberInput label="数量" min={1} withAsterisk suffix=" 本"
                      {...form.getInputProps(`items.${index}.quantity`)} />
                    <NumberInput label="単価" prefix="¥" thousandSeparator="," decimalScale={2} min={0}
                      {...form.getInputProps(`items.${index}.unitPrice`)} />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">金額</Text>
                    <Text size="sm" fw={600} ff="mono">{formatMoney(item.quantity * item.unitPrice)}</Text>
                  </Group>
                  {form.values.items.length > 1 && (
                    <Button variant="subtle" color="red" size="xs" leftSection={<IconMinus size={12} />}
                      onClick={() => form.removeListItem('items', index)}>
                      この明細を削除
                    </Button>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table withColumnBorders={false} withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 220 }}>製品</Table.Th>
                <Table.Th style={{ width: 100 }}>数量</Table.Th>
                <Table.Th style={{ width: 130 }}>単価</Table.Th>
                <Table.Th style={{ width: 110 }}>金額</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.items.map((item, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <Select placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
                      {...form.getInputProps(`items.${index}.productId`)} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput min={1} withAsterisk suffix=" 本" {...form.getInputProps(`items.${index}.quantity`)} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput prefix="¥" thousandSeparator="," decimalScale={2} min={0}
                      {...form.getInputProps(`items.${index}.unitPrice`)} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ta="right" ff="mono">{formatMoney(item.quantity * item.unitPrice)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Button variant="subtle" color="red" size="xs" px={4} disabled={form.values.items.length === 1}
                      onClick={() => form.removeListItem('items', index)} aria-label="この行を削除">
                      <IconMinus size={14} />
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Button variant="subtle" leftSection={<IconPlus size={14} />} mt="sm" size="sm" fullWidth={isMobile}
          onClick={() => form.insertListItem('items', { ...EMPTY_ITEM })}>
          明細を追加
        </Button>

        <Divider mt="sm" />
        <Group justify="flex-end" mt="sm">
          <Text size="sm" c="dimmed">合計金額</Text>
          <Text fw={700}>{formatMoney(totalAmount)}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
