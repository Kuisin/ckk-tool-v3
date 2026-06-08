/**
 * upload-design.tsx — 設計図アップロード / バージョン追加ポップアップ
 *
 * Controlled modal: upload a new design file version. Uploading increments the
 * version and flips is_latest. Built on the unified FormModal scaffold.
 */

import { useState } from 'react';
import { Button, FileButton, Group, Text, Textarea } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function UploadDesignModal({
  opened,
  onClose,
  requestNumber,
  nextVersion,
}: ModalBaseProps & { requestNumber: string; nextVersion: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="設計図のアップロード"
      submitLabel="アップロード"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      size="md"
    >
      <Text size="sm">
        設計依頼書「{requestNumber}」に新しい設計図を追加します。新バージョンは
        v{nextVersion} として登録され、最新版になります。
      </Text>
      <Group align="center" gap="sm">
        <FileButton onChange={setFile} accept="application/pdf,image/*,.dwg,.dxf">
          {(props) => (
            <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
              ファイルを選択
            </Button>
          )}
        </FileButton>
        <Text size="sm" c={file ? undefined : 'dimmed'}>
          {file ? file.name : 'ファイルが選択されていません'}
        </Text>
      </Group>
      <Textarea
        label="メモ"
        placeholder="変更内容のメモ（任意）"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
      />
      <Text size="xs" c="dimmed">
        設計図は SeaweedFS に保存され、バージョン管理されます（version / is_latest）。
      </Text>
    </FormModal>
  );
}
