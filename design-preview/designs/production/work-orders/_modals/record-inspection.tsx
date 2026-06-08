/**
 * record-inspection.tsx — 検査記録ポップアップ（検査表テンプレート）
 *
 * Opened from the step execution page. Captures measured values / pass-fail per
 * inspection item, then saves the inspection record. Built on FormModal (lib/modals).
 */

import { useState, useTransition } from 'react';
import { SegmentedControl, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export interface InspectionItem {
  id: string;
  name: string;
  tolerance: string;
}

export function RecordInspectionModal({
  opened,
  onClose,
  templateName,
  items,
}: ModalBaseProps & { templateName: string; items: InspectionItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [measured, setMeasured] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      console.log('inspection record', { measured, results });
      notifications.show({ title: '保存しました', message: '検査記録を保存しました', color: 'green' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`検査記録 — ${templateName}`}
      onSubmit={handleSubmit}
      submitLabel="記録を保存"
      loading={isPending}
      size="xl"
    >
      <Table withTableBorder verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>検査項目</Table.Th>
            <Table.Th>許容値</Table.Th>
            <Table.Th style={{ width: 160 }}>実測値</Table.Th>
            <Table.Th style={{ width: 200 }}>合否</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td><Text size="sm" fw={500}>{item.name}</Text></Table.Td>
              <Table.Td><Text size="sm" c="dimmed">{item.tolerance}</Text></Table.Td>
              <Table.Td>
                <TextInput
                  placeholder="実測値"
                  value={measured[item.id] ?? ''}
                  onChange={(e) => setMeasured((p) => ({ ...p, [item.id]: e.currentTarget.value }))}
                />
              </Table.Td>
              <Table.Td>
                <SegmentedControl
                  fullWidth
                  color={results[item.id] === 'FAIL' ? 'red' : 'green'}
                  data={[
                    { value: 'PASS', label: '合格' },
                    { value: 'FAIL', label: '不合格' },
                  ]}
                  value={results[item.id] ?? ''}
                  onChange={(v) => setResults((p) => ({ ...p, [item.id]: v }))}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </FormModal>
  );
}
