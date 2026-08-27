"use client";

/**
 * DesignFileSlot — 版の 1 枠（プレビュー / 図面データ / 参考資料）。
 *
 * **その場でファイルを選べば済むようにする。** 以前は「先に添付してから、
 * どれがどれかを選び直す」の 2 段だった。1 版 = 3 つの役割と決まっている
 * のだから、役割ごとに枠を出して直接入れるほうが手数が少ない。
 *
 * ただし**既に添付済みのファイルも使える**ようにしてある。設計依頼では
 * 作業中にファイルタブへ図面を上げていることが多く、そこを無視すると
 * 同じものを 2 回上げることになる。添付が 1 件も無ければ選択欄は出ない
 * （選ぶものが無い欄を並べても邪魔なだけ）。
 */

import { FileButton, Group, Select, Stack, Text } from "@mantine/core";
import { IconUpload, IconX } from "@tabler/icons-react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";

/** 枠の中身 — 新しく選んだファイル、既存の添付、または未選択。 */
export type SlotValue =
  | { kind: "file"; file: File }
  | { kind: "attachment"; id: string; filename: string }
  | null;

export interface SlotOption {
  value: string;
  label: string;
}

/** 枠に入っているものの表示名（未選択なら null）。 */
export function slotLabel(v: SlotValue): string | null {
  if (!v) return null;
  return v.kind === "file" ? v.file.name : v.filename;
}

export function DesignFileSlot({
  label,
  description,
  value,
  onChange,
  attachmentOptions = [],
  required,
  fullWidth,
  error,
}: {
  label: string;
  description: string;
  value: SlotValue;
  onChange: (v: SlotValue) => void;
  /** 既に添付済みのファイル。空なら選択欄そのものを出さない。 */
  attachmentOptions?: SlotOption[];
  required?: boolean;
  fullWidth?: boolean;
  error?: string;
}) {
  const name = slotLabel(value);

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
      <Text c="dimmed" size="xs">
        {description}
      </Text>
      <Group gap="xs" wrap="wrap">
        <FileButton
          onChange={(f) => onChange(f ? { kind: "file", file: f } : null)}
        >
          {(props) => (
            <SecondaryButton
              {...props}
              fullWidth={fullWidth}
              leftSection={<IconUpload size={14} />}
            >
              {name ? "選び直す" : "ファイルを選択"}
            </SecondaryButton>
          )}
        </FileButton>
        {name && (
          <Group gap={4} wrap="nowrap">
            <Text size="xs" style={{ overflowWrap: "anywhere" }}>
              {name}
            </Text>
            <GhostButton
              leftSection={<IconX size={12} />}
              onClick={() => onChange(null)}
            >
              取消
            </GhostButton>
          </Group>
        )}
      </Group>
      {attachmentOptions.length > 0 && (
        <Select
          clearable
          data={attachmentOptions}
          onChange={(id) => {
            const opt = attachmentOptions.find((o) => o.value === id);
            onChange(
              opt
                ? { kind: "attachment", id: opt.value, filename: opt.label }
                : null,
            );
          }}
          placeholder="または、添付済みから選ぶ"
          searchable
          size="xs"
          value={value?.kind === "attachment" ? value.id : null}
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
