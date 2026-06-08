/**
 * duplicate.tsx — 製品の複製ポップアップ（コピーして新規作成）
 *
 * Controlled FormModal: copies an existing product into a new draft. The product
 * code is auto-numbered on save, so the user only confirms the new 名称 / 単位 and
 * whether to carry over the 仕様（spec）and 設計図. Built on lib/modals FormModal.
 */

import { useState } from 'react';
import { Checkbox, Select, Stack, TextInput } from '@mantine/core';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { UNITS } from '../../../lib/mock';

export function DuplicateProductModal({
  opened,
  onClose,
  productCode,
  sourceName,
  sourceUnit = '本',
}: ModalBaseProps & { productCode: string; sourceName?: string; sourceUnit?: string }) {
  const [nameJa, setNameJa] = useState(sourceName ? `${sourceName}（コピー）` : '');
  const [nameEn, setNameEn] = useState('');
  const [unit, setUnit] = useState<string | null>(sourceUnit);
  const [copySpec, setCopySpec] = useState(true);
  const [copyDesign, setCopyDesign] = useState(true);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="製品の複製"
      submitLabel="複製して新規作成"
      onSubmit={handleSubmit}
      size="md"
    >
      <Stack gap="sm">
        <TextInput label="複製元" value={productCode} readOnly disabled />
        <TextInput
          label="名称（日本語）"
          placeholder="精密軸（コピー）"
          withAsterisk
          value={nameJa}
          onChange={(e) => setNameJa(e.currentTarget.value)}
        />
        <TextInput
          label="名称（English）"
          placeholder="Precision shaft (copy)"
          value={nameEn}
          onChange={(e) => setNameEn(e.currentTarget.value)}
        />
        <Select label="単位" data={UNITS} value={unit} onChange={setUnit} withAsterisk />
        <Checkbox
          label="仕様（spec）を引き継ぐ"
          checked={copySpec}
          onChange={(e) => setCopySpec(e.currentTarget.checked)}
        />
        <Checkbox
          label="設計図を引き継ぐ"
          checked={copyDesign}
          onChange={(e) => setCopyDesign(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}
