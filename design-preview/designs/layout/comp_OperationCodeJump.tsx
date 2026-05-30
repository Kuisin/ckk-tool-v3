'use client';

import {
  Box,
  Combobox,
  Group,
  Kbd,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowRight } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import {
  formatOperationCodeDisplay,
  navigateByOperationCode,
  sanitizeOperationCodeInput,
  searchOperationCodes,
} from '../lib/operation-codes';

interface OperationCodeJumpProps {
  onNavigate?: (href: string) => void;
  /** コンパクト表示（ヘッダー用） */
  compact?: boolean;
}

export function OperationCodeJump({ onNavigate, compact = false }: OperationCodeJumpProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const options = searchOperationCodes(value);

  useHotkeys([
    ['mod+K', () => inputRef.current?.focus()],
    ['mod+G', () => inputRef.current?.focus()],
  ]);

  function jump(raw: string) {
    const entry = navigateByOperationCode(raw, { onNavigate });
    if (entry) {
      notifications.show({
        title: `${formatOperationCodeDisplay(entry)} ${entry.label}`,
        message: entry.href,
        color: 'blue',
        autoClose: 2500,
      });
      setValue('');
      combobox.closeDropdown();
      return;
    }

    notifications.show({
      title: '操作コードが見つかりません',
      message: '4文字（例: PD02）',
      color: 'red',
      autoClose: 3000,
    });
  }

  function handleSubmit() {
    jump(value);
  }

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(optionValue) => {
        jump(optionValue);
      }}
    >
      <Combobox.Target>
        <TextInput
          ref={inputRef}
          value={value}
          onChange={(event) => {
            const next = sanitizeOperationCodeInput(event.currentTarget.value);
            setValue(next);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={compact ? 'コード' : '操作コード（例: PD02）'}
          aria-label="操作コードで画面へ移動"
          size={compact ? 'xs' : 'sm'}
          w={compact ? 92 : 168}
          leftSection={
            compact ? undefined : (
              <Text size="xs" c="dimmed" fw={600}>
                #
              </Text>
            )
          }
          rightSection={
            compact ? (
              <IconArrowRight size={14} style={{ opacity: 0.5 }} />
            ) : (
              <Group gap={4} wrap="nowrap">
                <Kbd size="xs">⌘K</Kbd>
              </Group>
            )
          }
          styles={{
            input: {
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.05em',
            },
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={options.length === 0}>
        <Combobox.Options>
          {options.map((entry) => (
            <Combobox.Option key={entry.code} value={entry.code}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatOperationCodeDisplay(entry)}
                </Text>
                <Text size="sm">{entry.label}</Text>
                <Box ml="auto">
                  <Text size="xs" c="dimmed">
                    {entry.category}
                  </Text>
                </Box>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
