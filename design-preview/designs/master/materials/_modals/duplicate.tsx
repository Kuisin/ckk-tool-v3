/**
 * duplicate.tsx — 素材の複製ポップアップ（コピーして新規作成）
 *
 * Controlled FormModal: copies an existing material into a new draft. The user
 * supplies a new 素材コード (code-format validated) and may adjust 名称 / 材種 /
 * 形態 / 単位. Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Select, Stack, TextInput } from '@mantine/core';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { MATERIAL_TYPES, UNITS } from '../../../lib/mock';

const MATERIAL_CODE_RE = /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/;

const FORM_OPTIONS = [
  { value: 'POLISHED', label: '研磨' },
  { value: 'STANDARD_LENGTH', label: '定尺' },
  { value: 'SEMI_FINISHED', label: '半製品' },
  { value: 'OTHER', label: 'その他' },
];

export function DuplicateMaterialModal({
  opened,
  onClose,
  sourceCode,
  sourceName,
  sourceTypeId,
  sourceForm = 'POLISHED',
  sourceUnit = '本',
}: ModalBaseProps & {
  sourceCode: string;
  sourceName?: string;
  sourceTypeId?: string;
  sourceForm?: string;
  sourceUnit?: string;
}) {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameJa, setNameJa] = useState(sourceName ? `${sourceName}（コピー）` : '');
  const [nameEn, setNameEn] = useState('');
  const [typeId, setTypeId] = useState<string | null>(sourceTypeId ?? null);
  const [form, setForm] = useState<string | null>(sourceForm);
  const [unit, setUnit] = useState<string | null>(sourceUnit);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!MATERIAL_CODE_RE.test(code)) {
      setCodeError('形式は [材種]-[A-C][0-9]{3}-[0-9]{3} で入力してください');
      return;
    }
    setCodeError(null);
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="素材の複製"
      submitLabel="複製して新規作成"
      onSubmit={handleSubmit}
      size="md"
    >
      <Stack gap="sm">
        <TextInput label="複製元" value={sourceCode} readOnly disabled />
        <TextInput
          label="素材コード"
          placeholder="A01A0001-A001-002"
          description="形式: [材種]-[A-C][0-9]{3}-[0-9]{3}"
          withAsterisk
          value={code}
          error={codeError}
          onChange={(e) => setCode(e.currentTarget.value)}
        />
        <Select label="材種" data={MATERIAL_TYPES} value={typeId} onChange={setTypeId} searchable withAsterisk />
        <TextInput
          label="名称（日本語）"
          withAsterisk
          value={nameJa}
          onChange={(e) => setNameJa(e.currentTarget.value)}
        />
        <TextInput
          label="名称（English）"
          value={nameEn}
          onChange={(e) => setNameEn(e.currentTarget.value)}
        />
        <Select label="形態" data={FORM_OPTIONS} value={form} onChange={setForm} withAsterisk />
        <Select label="単位" data={UNITS} value={unit} onChange={setUnit} withAsterisk />
      </Stack>
    </FormModal>
  );
}
