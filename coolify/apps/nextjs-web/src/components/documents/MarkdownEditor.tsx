"use client";

/**
 * MarkdownEditor — Markdown ソースを書く。編集 / プレビュー / 分割。
 *
 * WYSIWYG は入れていない。Markdown ソースが正なので、往復変換を挟むと触って
 * いない行まで書き換わり、行差分と行コメントの追従がノイズだらけになる。
 */

import {
  Box,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import { lineCountOf, MAX_DOC_LINES } from "@/lib/line-anchor";
import { MarkdownView } from "./MarkdownView";

type Mode = "edit" | "preview" | "split";

/** 選択範囲を装飾で包む（トグルではなく単純な挿入 — 予測できる挙動を優先）。 */
function wrapSelection(
  el: HTMLTextAreaElement,
  before: string,
  after = before,
): string {
  const { selectionStart: s, selectionEnd: e, value } = el;
  return `${value.slice(0, s)}${before}${value.slice(s, e)}${after}${value.slice(e)}`;
}

function prefixLine(el: HTMLTextAreaElement, prefix: string): string {
  const { selectionStart: s, value } = el;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  return `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
}

export function MarkdownEditor({
  value,
  onChange,
  minRows = 20,
}: {
  value: string;
  onChange: (next: string) => void;
  minRows?: number;
}) {
  const isMobile = useIsMobile();
  // スマホに分割表示は無い。横 375px を 2 つに割ると、どちらも読めない。
  const [mode, setMode] = useState<Mode>("split");
  const effectiveMode: Mode = isMobile && mode === "split" ? "edit" : mode;
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  const lines = lineCountOf(value);
  const tooLong = lines > MAX_DOC_LINES;

  const apply = (fn: (el: HTMLTextAreaElement) => string) => {
    if (!el) return;
    onChange(fn(el));
    el.focus();
  };

  const editor = (
    <Stack gap="xs">
      <Group gap="xs" wrap="wrap">
        <GhostButton onClick={() => apply((e) => wrapSelection(e, "**"))}>
          太字
        </GhostButton>
        <GhostButton onClick={() => apply((e) => wrapSelection(e, "_"))}>
          斜体
        </GhostButton>
        <GhostButton onClick={() => apply((e) => wrapSelection(e, "`"))}>
          コード
        </GhostButton>
        <GhostButton onClick={() => apply((e) => prefixLine(e, "## "))}>
          見出し
        </GhostButton>
        <GhostButton onClick={() => apply((e) => prefixLine(e, "- "))}>
          箇条書き
        </GhostButton>
        <GhostButton
          onClick={() => apply((e) => wrapSelection(e, "[", "](/)"))}
        >
          リンク
        </GhostButton>
      </Group>
      <Textarea
        autosize
        error={
          tooLong
            ? `本文が長すぎます（${lines} 行 / 上限 ${MAX_DOC_LINES} 行）。文書を分けてください`
            : undefined
        }
        minRows={minRows}
        onChange={(e) => onChange(e.currentTarget.value)}
        ref={setEl}
        spellCheck={false}
        styles={{
          input: { fontFamily: "var(--mantine-font-family-monospace)" },
        }}
        value={value}
      />
      <Text c="dimmed" size="xs">
        {lines} 行
      </Text>
    </Stack>
  );

  const preview = (
    <Paper p="md" radius="md" withBorder>
      <MarkdownView body={value} />
    </Paper>
  );

  return (
    <Stack gap="sm">
      <SegmentedControl
        data={
          isMobile
            ? [
                { value: "edit", label: "編集" },
                { value: "preview", label: "プレビュー" },
              ]
            : [
                { value: "edit", label: "編集" },
                { value: "split", label: "分割" },
                { value: "preview", label: "プレビュー" },
              ]
        }
        fullWidth={isMobile}
        onChange={(v) => setMode(v as Mode)}
        value={effectiveMode}
      />
      {effectiveMode === "edit" && editor}
      {effectiveMode === "preview" && preview}
      {effectiveMode === "split" && (
        <Group align="flex-start" grow wrap="nowrap">
          <Box style={{ minWidth: 0 }}>{editor}</Box>
          <Box style={{ minWidth: 0 }}>{preview}</Box>
        </Group>
      )}
    </Stack>
  );
}
