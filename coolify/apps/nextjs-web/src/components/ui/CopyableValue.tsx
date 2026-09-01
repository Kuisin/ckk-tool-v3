"use client";

/**
 * CopyableValue — 他の道具へ貼るための値を、そのまま写せる形で出す。
 *
 * 「Metabase でこのフォームだけを見たい」ときに要るのはフォームコードひとつ
 * だが、画面のどこかに小さく書いてあるだけだと**手で書き写して打ち間違える**。
 * 値とコピーを 1 つの塊にして、押せば確実に同じ文字列が入るようにする。
 */

import { CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { GhostButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";

export function CopyableValue({
  value,
  label,
  description,
}: {
  value: string;
  label?: string;
  /** 値の下に出す一言（何に使う値なのか）。 */
  description?: string;
}) {
  const tr = useTr();
  return (
    <Group align="center" gap="xs" wrap="wrap">
      {label && (
        <Text c="dimmed" size="xs">
          {label}
        </Text>
      )}
      <Text
        ff="mono"
        fw={600}
        size="sm"
        style={{ userSelect: "all", wordBreak: "break-all" }}
      >
        {value}
      </Text>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip
            label={copied ? "コピーしました" : tr("コピー")}
            withinPortal
          >
            <GhostButton
              aria-label={tr("{v0}をコピー", { v0: label ?? tr("値") })}
              leftSection={
                copied ? <IconCheck size={14} /> : <IconCopy size={14} />
              }
              onClick={copy}
            >
              {copied ? "コピーしました" : tr("コピー")}
            </GhostButton>
          </Tooltip>
        )}
      </CopyButton>
      {description && (
        <Text c="dimmed" size="xs" w="100%">
          {description}
        </Text>
      )}
    </Group>
  );
}
