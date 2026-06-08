/**
 * upload-order.tsx — 注文書PDFアップロードポップアップ
 *
 * Controlled modal: attach / replace the received customer order PDF (FAX等).
 * Stored in SeaweedFS and referenced via the files table. FormModal scaffold.
 */

import { useState } from 'react';
import { Button, FileButton, Group, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function UploadOrderModal({
  opened,
  onClose,
  orderNumber,
  currentFileName,
}: ModalBaseProps & { orderNumber: string; currentFileName?: string }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="注文書PDFのアップロード"
      submitLabel="アップロード"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      size="md"
    >
      <Text size="sm">
        注文受諾書「{orderNumber}」に受領した注文書 PDF を添付します。
      </Text>
      <Group align="center" gap="sm">
        <FileButton onChange={setFile} accept="application/pdf">
          {(props) => (
            <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
              ファイルを選択
            </Button>
          )}
        </FileButton>
        <Text size="sm" c={file ? undefined : 'dimmed'}>
          {file ? file.name : currentFileName ?? 'ファイルが選択されていません'}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        受領した注文書 PDF は SeaweedFS に保存され files テーブルで参照されます。
      </Text>
    </FormModal>
  );
}
