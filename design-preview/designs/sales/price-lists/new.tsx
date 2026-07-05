'use client';

import { useTransition } from 'react';
import { Alert, NumberInput, Select, SimpleGrid, Switch } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar, IconInfoCircle } from '@tabler/icons-react';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell } from '../../lib/shells';
import { CUSTOMERS, ORDER_TYPE_OPTIONS, PRODUCTS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const priceListSchema = z.object({
  customerId: z.string().min(1, '顧客を選択してください'),
  productId: z.string().min(1, '製品を選択してください'),
  orderType: z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  minQuantity: z.number().int().min(1, '1以上を入力してください'),
  maxQuantity: z.number().int().nullable(),
  unitPrice: z.number().min(0),
  currency: z.string().min(1),
  validFrom: z.date({ message: '有効開始日を選択してください' }),
  validUntil: z.date().nullable(),
  isActive: z.boolean(),
});

type PriceListFormValues = z.infer<typeof priceListSchema>;

export default function PriceListNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<PriceListFormValues>({
    validate: zodResolver(priceListSchema),
    initialValues: {
      customerId: '',
      productId: '',
      orderType: 'PRODUCTION',
      minQuantity: 1,
      maxQuantity: null,
      unitPrice: 0,
      currency: 'JPY',
      validFrom: new Date(),
      validUntil: null,
      isActive: true,
    },
  });

  const handleSubmit = (values: PriceListFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '価格表を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', '販売', '価格表', '新規作成']}
      title="価格表 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
        通常、価格表は試算（SA05）を確定して「価格表に登録」から作成します。この画面は既存価格の手動登録・例外登録用です。
      </Alert>

      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="顧客" placeholder="顧客を選択" data={CUSTOMERS} searchable withAsterisk
            {...form.getInputProps('customerId')} />
          <Select label="製品" placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
            {...form.getInputProps('productId')} />
          <Select label="注文種別" data={ORDER_TYPE_OPTIONS} {...form.getInputProps('orderType')} />
        </SimpleGrid>
      </FormSection>

      <FormSection title="数量・単価">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <NumberInput label="最小数量" min={1} withAsterisk {...form.getInputProps('minQuantity')} />
          <NumberInput label="最大数量" placeholder="空欄で上限なし" min={1} {...form.getInputProps('maxQuantity')} />
          <NumberInput label="単価" prefix="¥" thousandSeparator="," decimalScale={2} min={0} withAsterisk
            {...form.getInputProps('unitPrice')} />
          <Select label="通貨" data={[
            { value: 'JPY', label: 'JPY（円）' },
            { value: 'USD', label: 'USD（米ドル）' },
          ]} {...form.getInputProps('currency')} />
        </SimpleGrid>
      </FormSection>

      <FormSection title="有効期間">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <DatePickerInput label="有効開始日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" withAsterisk {...form.getInputProps('validFrom')} />
          <DatePickerInput label="有効終了日" placeholder="空欄で無期限" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('validUntil')} />
        </SimpleGrid>
        <Switch label="有効" mt="md" checked={form.values.isActive}
          {...form.getInputProps('isActive', { type: 'checkbox' })} />
      </FormSection>
    </FormShell>
  );
}
