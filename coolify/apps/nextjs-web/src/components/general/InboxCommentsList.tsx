"use client";

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { InboxCommentRow } from "@/app/(dashboard)/general/tasks/comments-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/useViewport";

export function InboxCommentsList({ rows }: { rows: InboxCommentRow[] }) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <EmptyState
          icon={<IconMessage size={28} />}
          message={tr(
            "general.inboxCommentsList.thereAreNoUnresolvedCommentsOn",
          )}
        />
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Paper
          key={`${row.pageNumber}-${row.createdAt}`}
          onClick={() =>
            router.push(`/general/documents/${row.pageNumber}/review`)
          }
          p="sm"
          radius="sm"
          style={{ cursor: "pointer" }}
          withBorder
        >
          <Stack gap={4}>
            <Group
              gap="xs"
              justify="space-between"
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                  {row.pageTitle}
                </Text>
                <Badge color="gray" size="xs" variant="light">
                  {row.line == null
                    ? `旧 ${row.anchorLine} 行目`
                    : `${row.line} 行目`}
                </Badge>
              </Group>
              <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
                {row.author ?? tr("common.unknown")} ·{" "}
                {fmt.dateTime(row.createdAt)}
              </Text>
            </Group>
            <Text lineClamp={2} size="sm">
              {row.body}
            </Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
