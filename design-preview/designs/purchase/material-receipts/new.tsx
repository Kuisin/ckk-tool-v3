'use client';

import {
  Box,
  Breadcrumbs,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm, type FormErrors } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import { MATERIALS, SUPPLIERS, UNITS } from '../../lib/mock';
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
const receiptSchema = z.object({
  materialId: z.string().min(1, '素材を選択してください'),
  supplierId: z.string().nullable(),
  quantity: z.number().min(0.001, '数量を入力してください'),
  unit: z.string().min(1, '単位を選択してください'),
  receivedAt: z.date().nullable(),
  notes: z.string().optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

export default function MaterialReceiptNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ReceiptFormValues>({
    validate: zodResolver(receiptSchema),
    initialValues: {
      materialId: '',
      supplierId: null,
      quantity: 1,
      unit: '本',
      receivedAt: null,
      notes: '',
    },
  });

  const handleSubmit = (values: ReceiptFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({
          title: '保存しました',
          message: '素材入荷を登録しました',
          color: 'green',
        });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      {/* Page header */}
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          {!isMobile && (
            <Breadcrumbs>
              <Text size="sm" c="dimmed">ホーム</Text>
              <Text size="sm" c="dimmed">購買</Text>
              <Text size="sm" c="dimmed">素材入荷</Text>
              <Text size="sm">素材入荷登録</Text>
            </Breadcrumbs>
          )}
          <Title order={isMobile ? 3 : 2}>素材入荷登録</Title>
        </Stack>
      </Group>

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">入荷情報</Title>
            <Divider mb="md" />

            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="素材"
                placeholder="素材を選択"
                data={MATERIALS}
                searchable
                withAsterisk
                {...form.getInputProps('materialId')}
              />
              <Select
                label="仕入先"
                placeholder="仕入先を選択"
                data={SUPPLIERS}
                searchable
                clearable
                {...form.getInputProps('supplierId')}
              />
              <NumberInput
                label="数量"
                placeholder="数量"
                min={0}
                decimalScale={3}
                thousandSeparator=","
                withAsterisk
                {...form.getInputProps('quantity')}
              />
              <Select
                label="単位"
                placeholder="単位を選択"
                data={UNITS}
                withAsterisk
                {...form.getInputProps('unit')}
              />
              <DatePickerInput
                label="入荷日"
                placeholder="日付を選択"
                leftSection={<IconCalendar size={14} />}
                valueFormat="YYYY/MM/DD"
                clearable
                withAsterisk
                {...form.getInputProps('receivedAt')}
              />
            </SimpleGrid>

            <Textarea
              label="備考"
              placeholder="ロット・検収メモなど"
              mt="sm"
              rows={3}
              {...form.getInputProps('notes')}
            />
          </Paper>

          {/* Form actions */}
          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>
                保存
              </Button>
              <Button variant="default" fullWidth>
                キャンセル
              </Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default">キャンセル</Button>
              <Button type="submit" loading={isPending}>
                保存
              </Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
