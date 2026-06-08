/**
 * add-item.tsx — 検査項目追加ポップアップ（quick-create）
 *
 * Controlled modal opened from the 検査項目 tab on the template detail page.
 * Built on the unified FormModal scaffold (lib/modals) with @mantine/form +
 * zodResolver (lib/form).
 */

import { useForm } from '@mantine/form';
import { NumberInput, Select, SimpleGrid, Switch } from '@mantine/core';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { LocalizedTextInput } from '../../../lib/shells';
import { UNITS } from '../../../lib/mock';

const itemSchema = z.object({
  nameJa: z.string().min(1, '項目名（日本語）を入力してください'),
  nameEn: z.string().min(1, '項目名（英語）を入力してください'),
  unit: z.string().optional(),
  toleranceMin: z.number().nullable(),
  toleranceMax: z.number().nullable(),
  isRequired: z.boolean(),
  sortOrder: z.number().int().min(0),
});

type ItemValues = z.infer<typeof itemSchema>;

export function AddInspectionItemModal({
  opened,
  onClose,
  nextSortOrder = 0,
}: ModalBaseProps & { nextSortOrder?: number }) {
  const form = useForm<ItemValues>({
    validate: zodResolver(itemSchema),
    initialValues: {
      nameJa: '',
      nameEn: '',
      unit: '',
      toleranceMin: null,
      toleranceMax: null,
      isRequired: true,
      sortOrder: nextSortOrder,
    },
  });

  const handleSubmit = (values: ItemValues) => {
    console.log('Add inspection item:', values);
    form.reset();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="検査項目の追加"
      submitLabel="追加"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <LocalizedTextInput
        label="項目名"
        required
        jaProps={form.getInputProps('nameJa')}
        enProps={form.getInputProps('nameEn')}
      />
      <SimpleGrid cols={2} spacing="sm">
        <Select
          label="単位"
          placeholder="mm"
          data={UNITS}
          searchable
          clearable
          {...form.getInputProps('unit')}
        />
        <NumberInput label="表示順" min={0} {...form.getInputProps('sortOrder')} />
        <NumberInput
          label="許容値下限"
          decimalScale={3}
          {...form.getInputProps('toleranceMin')}
        />
        <NumberInput
          label="許容値上限"
          decimalScale={3}
          {...form.getInputProps('toleranceMax')}
        />
      </SimpleGrid>
      <Switch label="必須" {...form.getInputProps('isRequired', { type: 'checkbox' })} />
    </FormModal>
  );
}
