"use client";

/**
 * OperationCodeJump.tsx — 操作コード jump input (_specs/design.md §6).
 *
 * 4-char code (e.g. PD02) → navigates to the screen. ⌘/ focuses the input.
 * Compact mode renders in the AppShell header center.
 */

import {
  Box,
  Combobox,
  Group,
  Kbd,
  Text,
  TextInput,
  useCombobox,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowRight } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { appKeyForPath, useDisabledApps } from "@/components/layout/AppFlags";
import {
  formatOperationCodeDisplay,
  navigateByOperationCode,
  sanitizeOperationCodeInput,
  searchOperationCodes,
} from "@/lib/operation-codes";

interface OperationCodeJumpProps {
  /** Extra hook on navigation (e.g. close a parent popover). */
  onNavigate?: (href: string) => void;
  /** コンパクト表示（ヘッダー用） */
  compact?: boolean;
}

export function OperationCodeJump({
  onNavigate,
  compact = false,
}: OperationCodeJumpProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const disabledApps = useDisabledApps();
  // 環境別フラグで無効化されたアプリの画面は候補から除外する。
  const options = searchOperationCodes(value).filter((e) => {
    const key = appKeyForPath(e.href);
    return !key || !disabledApps.has(key);
  });

  useHotkeys([
    [
      "mod+/",
      () => {
        if (inputRef.current?.offsetParent === null) return;
        inputRef.current?.focus();
      },
    ],
  ]);

  function jump(raw: string) {
    const entry = navigateByOperationCode(raw, {
      onNavigate: (href) => {
        router.push(href);
        onNavigate?.(href);
      },
    });
    if (entry) {
      notifications.show({
        title: `${formatOperationCodeDisplay(entry)} ${entry.label}`,
        message: entry.href,
        color: "blue",
        autoClose: 2500,
      });
      setValue("");
      combobox.closeDropdown();
      return;
    }

    notifications.show({
      title: "操作コードが見つかりません",
      message: "4文字（例: PD02）",
      color: "red",
      autoClose: 3000,
    });
  }

  return (
    <Combobox
      onOptionSubmit={(optionValue) => jump(optionValue)}
      store={combobox}
    >
      <Combobox.Target>
        <TextInput
          aria-label="操作コードで画面へ移動"
          leftSection={
            compact ? undefined : (
              <Text c="dimmed" fw={600} size="xs">
                #
              </Text>
            )
          }
          onBlur={() => combobox.closeDropdown()}
          onChange={(event) => {
            setValue(sanitizeOperationCodeInput(event.currentTarget.value));
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jump(value);
            }
          }}
          placeholder={compact ? "コード" : "操作コード（例: PD02）"}
          ref={inputRef}
          rightSection={
            compact ? (
              <IconArrowRight className="opacity-50" size={14} />
            ) : (
              <Group gap={4} wrap="nowrap">
                <Kbd size="xs">⌘/</Kbd>
              </Group>
            )
          }
          size={compact ? "xs" : "sm"}
          styles={{
            input: {
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.05em",
            },
          }}
          value={value}
          w={compact ? { base: 80, md: 92 } : 168}
        />
      </Combobox.Target>

      <Combobox.Dropdown
        hidden={options.length === 0}
        mah={compact ? { base: "min(280px, 50dvh)", md: undefined } : undefined}
        miw={
          compact
            ? { base: "min(240px, calc(100vw - 2rem))", md: undefined }
            : undefined
        }
      >
        <Combobox.Options>
          {options.map((entry) => (
            <Combobox.Option key={entry.code} value={entry.code}>
              <Group className="flex-wrap md:flex-nowrap" gap="xs">
                <Text className="tabular-nums" fw={600} size="sm">
                  {formatOperationCodeDisplay(entry)}
                </Text>
                <Text size="sm">{entry.label}</Text>
                <Box ml="auto" visibleFrom="md">
                  <Text c="dimmed" size="xs">
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
