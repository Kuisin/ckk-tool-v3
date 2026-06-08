/**
 * replace-design.tsx — 設計図差し替えポップアップ（新バージョン登録）
 *
 * Controlled FormModal: upload a new design file. The current file becomes a
 * previous version; the upload is registered as the latest design_file (version+1).
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Group, Paper, Stack, Text, Textarea, ThemeIcon } from '@mantine/core';
import { IconFileTypePdf, IconRuler2, IconUpload } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function ReplaceDesignModal({
  opened,
  onClose,
  productCode,
  currentFileName,
  currentVersion,
}: ModalBaseProps & { productCode: string; currentFileName: string; currentVersion: number }) {
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="設計図の差し替え"
      submitLabel={`v${currentVersion + 1} として登録`}
      onSubmit={handleSubmit}
      size="md"
    >
      <Stack gap="sm">
        <Text size="sm">
          製品「{productCode}」の設計図を差し替えます。アップロードしたファイルは最新版
          （v{currentVersion + 1}）として登録され、現在の設計図は旧バージョンとして保持されます。
        </Text>

        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <ThemeIcon variant="light" color="red" size="md" radius="sm">
              <IconFileTypePdf size={18} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="sm">{currentFileName}</Text>
              <Text size="xs" c="dimmed">現在の設計図（v{currentVersion}）</Text>
            </Stack>
          </Group>
        </Group>

        <Paper withBorder radius="md" p="lg" style={{ borderStyle: 'dashed', cursor: 'pointer' }}>
          <Stack align="center" gap="xs">
            <ThemeIcon variant="light" color="gray" size="xl" radius="md">
              <IconUpload size={24} />
            </ThemeIcon>
            <Text size="sm" c="dimmed">新しい設計図をドラッグまたはクリックしてアップロード</Text>
            <Group gap={6} c="dimmed">
              <IconRuler2 size={14} />
              <Text size="xs" c="dimmed">PDF / DWG / 画像</Text>
            </Group>
          </Stack>
        </Paper>

        <Textarea
          label="変更メモ"
          placeholder="差し替え理由・変更点など"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}
