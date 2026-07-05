"use client";

/**
 * PlaceholderPage.tsx — stub screen used while page structure precedes
 * feature implementation. Renders the standard PageHeader (design.md §10.2)
 * plus an EmptyState so every route is navigable from day one.
 */

import { Paper, Stack, Text } from "@mantine/core";
import { IconTool } from "@tabler/icons-react";
import { EmptyState } from "./EmptyState";
import { type Crumb, PageHeader } from "./PageHeader";

export function PlaceholderPage({
  title,
  breadcrumbs,
  operationCode,
}: {
  title: string;
  breadcrumbs: Crumb[];
  operationCode?: string;
}) {
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={breadcrumbs}
        status={
          operationCode ? (
            <Text c="dimmed" className="tabular-nums" ff="mono" size="xs">
              {operationCode}
            </Text>
          ) : undefined
        }
        title={title}
      />
      <Paper p="sm" shadow="xs">
        <EmptyState
          icon={<IconTool size={24} />}
          message="この画面は準備中です"
        />
      </Paper>
    </Stack>
  );
}
