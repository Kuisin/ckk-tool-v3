/**
 * add-member.tsx — 承認グループ メンバー追加ポップアップ（quick-create）
 *
 * Controlled modal opened from the メンバー tab on the group detail page.
 * Built on the unified FormModal scaffold (lib/modals) with @mantine/form +
 * zodResolver (lib/form). Multi-select to add several approvers at once.
 */

import { useForm } from '@mantine/form';
import { MultiSelect } from '@mantine/core';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { USER_OPTIONS } from '../../../lib/mock';

const addMemberSchema = z.object({
  memberIds: z.array(z.string()).min(1, '承認者を1名以上選択してください'),
});

type AddMemberValues = z.infer<typeof addMemberSchema>;

export function AddMemberModal({
  opened,
  onClose,
  excludeIds = [],
}: ModalBaseProps & { excludeIds?: string[] }) {
  const form = useForm<AddMemberValues>({
    validate: zodResolver(addMemberSchema),
    initialValues: { memberIds: [] },
  });

  const handleSubmit = (values: AddMemberValues) => {
    console.log('Add members:', values.memberIds);
    form.reset();
    onClose();
  };

  const data = USER_OPTIONS.filter((u) => !excludeIds.includes(u.value));

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="メンバーの追加"
      submitLabel="追加"
      size="md"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <MultiSelect
        label="承認者"
        placeholder="承認者を選択"
        data={data}
        searchable
        clearable
        withAsterisk
        {...form.getInputProps('memberIds')}
      />
    </FormModal>
  );
}
