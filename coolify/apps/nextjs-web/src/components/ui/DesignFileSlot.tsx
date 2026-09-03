"use client";

/**
 * DesignFileSlot — 版の 1 枠（プレビュー / 図面データ / 参考資料）。
 *
 * **入口はアップロードだけ。** 以前は「その場で上げる」と「添付済みから選ぶ」
 * の 2 通りがあったが、同じことをする道が 2 本あると、どちらを使えばよいか
 * 迷ううえ、片方だけ直したときに挙動がずれる。上げたファイルは必ず
 * どれか 1 つの役割に入る、という単純な形にそろえた。
 *
 * 枚数は役割で決まる — プレビューと図面データは 1 枚ずつ、参考資料は何枚でも。
 * 参考資料だけ説明を付けられる（「部品図」「寸法表」など、後から見て
 * 何の図か判るように）。
 */

import { FileButton, Group, Stack, Text, TextInput } from "@mantine/core";
import { IconUpload, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";

export function DesignFileSlot({
  label,
  description,
  file,
  onPick,
  note,
  onNoteChange,
  notePlaceholder: notePlaceholderProp,
  required,
  fullWidth,
  error,
}: {
  label: string;
  description?: string;
  file: File | null;
  onPick: (f: File | null) => void;
  /** 説明を付けられる枠のときだけ渡す（参考資料）。 */
  note?: string;
  onNoteChange?: (v: string) => void;
  notePlaceholder?: string;
  required?: boolean;
  fullWidth?: boolean;
  error?: string;
}) {
  const tr = useTranslations();
  const notePlaceholder =
    notePlaceholderProp ?? tr("ui.designFileSlot.descriptionOptional");
  return (
    <Stack gap={4}>
      <Text fw={500} size="sm">
        {label}
        {required && (
          <Text c="red" component="span" size="sm">
            {" *"}
          </Text>
        )}
      </Text>
      {description && (
        <Text c="dimmed" size="xs">
          {description}
        </Text>
      )}
      <Group gap="xs" wrap="wrap">
        <FileButton onChange={onPick}>
          {(props) => (
            <SecondaryButton
              {...props}
              fullWidth={fullWidth}
              leftSection={<IconUpload size={14} />}
            >
              {file ? "選び直す" : tr("common.selectAFile")}
            </SecondaryButton>
          )}
        </FileButton>
        {file && (
          <Group gap={4} wrap="nowrap">
            <Text size="xs" style={{ overflowWrap: "anywhere" }}>
              {file.name}
            </Text>
            <GhostButton
              leftSection={<IconX size={12} />}
              onClick={() => onPick(null)}
            >
              {tr("ui.designFileSlot.cancel")}
            </GhostButton>
          </Group>
        )}
      </Group>
      {onNoteChange && (
        <TextInput
          onChange={(e) => onNoteChange(e.currentTarget.value)}
          placeholder={notePlaceholder}
          size="xs"
          value={note ?? ""}
        />
      )}
      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}
    </Stack>
  );
}
