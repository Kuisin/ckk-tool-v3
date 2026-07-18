"use client";

/**
 * CodeExpressionEditor — 試算計算の式エディタ（依存なしのシンタックスハイライト）。
 *
 * 透明 textarea を色付き <pre> オーバーレイに重ねる古典手法。上部に「利用可能な変数」
 * のクリック挿入パレットと「整形」ボタン。ハイライト/整形は lib/js-highlight.ts。
 */

import { Box, Group, Text } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import { useMemo, useRef } from "react";
import { GhostButton } from "@/components/ui/buttons";
import { formatExpression, highlightExpression } from "@/lib/js-highlight";

export interface VariableGroup {
  group: string;
  items: { token: string; label?: string }[];
}

const EDITOR_FONT = {
  fontFamily: "var(--mantine-font-family-monospace)",
  fontSize: "13px",
  lineHeight: "1.55",
  tabSize: 2,
} as const;

const BOX_PAD = "8px 10px";

export function CodeExpressionEditor({
  value,
  onChange,
  variables = [],
  minRows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  variables?: VariableGroup[];
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 変数色分け用: パレットのトークンからベース識別子を集める。
  const knownVars = useMemo(() => {
    const s = new Set<string>();
    for (const g of variables) {
      for (const it of g.items) {
        const base = it.token.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
        if (base) s.add(base);
      }
    }
    return s;
  }, [variables]);

  const html = highlightExpression(value, knownVars);

  const insert = (token: string) => {
    const ta = ref.current;
    if (!ta) {
      onChange(value + token);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const minHeight = `calc(${minRows} * ${EDITOR_FONT.lineHeight} * ${EDITOR_FONT.fontSize})`;

  return (
    <Box>
      {variables.length > 0 && (
        <Box mb={6}>
          <Text c="dimmed" mb={2} size="xs">
            利用可能な変数（クリックで挿入）
          </Text>
          {variables.map((g) => (
            <Group gap={4} key={g.group} mb={2} wrap="wrap">
              <Text c="dimmed" size="xs" style={{ minWidth: 64 }}>
                {g.group}
              </Text>
              {g.items.map((it) => (
                <button
                  key={it.token}
                  onClick={() => insert(it.token)}
                  style={{
                    fontFamily: "var(--mantine-font-family-monospace)",
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--mantine-color-default-border)",
                    background: "var(--mantine-color-body)",
                    color: "var(--mantine-color-teal-7)",
                    cursor: "pointer",
                  }}
                  type="button"
                >
                  {it.label ?? it.token}
                </button>
              ))}
            </Group>
          ))}
        </Box>
      )}

      <Group justify="flex-end" mb={4}>
        <GhostButton
          leftSection={<IconWand size={14} />}
          onClick={() => onChange(formatExpression(value))}
          size="compact-xs"
        >
          整形
        </GhostButton>
      </Group>

      <Box
        style={{
          position: "relative",
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: "var(--mantine-radius-sm)",
          background: "var(--mantine-color-body)",
          overflow: "hidden",
        }}
      >
        <pre
          aria-hidden
          // biome-ignore lint/security/noDangerouslySetInnerHtml: our own escaping highlighter (lib/js-highlight.ts)
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            ...EDITOR_FONT,
            margin: 0,
            padding: BOX_PAD,
            minHeight,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
        />
        <textarea
          onChange={(e) => onChange(e.currentTarget.value)}
          ref={ref}
          spellCheck={false}
          style={{
            ...EDITOR_FONT,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            padding: BOX_PAD,
            margin: 0,
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            background: "transparent",
            color: "transparent",
            caretColor: "var(--mantine-color-text)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
          value={value}
        />
      </Box>
    </Box>
  );
}
