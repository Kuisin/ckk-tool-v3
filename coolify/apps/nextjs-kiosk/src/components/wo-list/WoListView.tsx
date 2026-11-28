"use client";

/**
 * WoListView.tsx — 指示書一覧（承認済み / 進行中）。
 *
 * 検索欄 1 つで 指示書番号・書類番号・製品名・製品コードを引く（AND・全角可 —
 * wo-list-core.ts）。行を押すと /wo-scan/[woNumber]?from=list（指示書スキャンと
 * 同じ工程一覧。戻るとこの一覧へ帰る）。
 */

import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconClipboardList,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fillMessage } from "@/lib/i18n";
import { filterWoList, type WoListItem } from "@/lib/wo-list-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";

/** WORK_ORDER_STATUS → バッジ色（design.md §9 と同じ対応）。 */
const WO_STATUS_COLOR: Record<string, string> = {
  APPROVED: "blue",
  IN_PROGRESS: "violet",
};

export function WoListView({
  items,
  plantName,
  truncated,
}: {
  items: WoListItem[];
  plantName: string | null;
  truncated: boolean;
}) {
  const router = useRouter();
  const { m } = useI18n();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const shown = useMemo(() => filterWoList(items, query), [items, query]);

  const statusLabel = (status: string) =>
    (m.woScan.status as Record<string, string | undefined>)[status] ?? status;

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() は完了を待てないので、視覚的な二度押し防止だけ行う
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={960} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<IconArrowLeft size={20} />}
              onClick={() => router.push("/")}
              variant="default"
            >
              {m.woScan.back}
            </Button>
            <Title order={3}>{m.woList.title}</Title>
          </Group>
          <Button
            leftSection={<IconRefresh size={20} />}
            loading={refreshing}
            onClick={refresh}
            variant="default"
          >
            {m.steps.refresh}
          </Button>
        </Group>

        <Text c="dimmed">
          {plantName
            ? fillMessage(m.woList.scopePlant, { plant: plantName })
            : m.woList.scopeAll}
        </Text>

        <TextInput
          aria-label={m.woList.searchPlaceholder}
          leftSection={<IconSearch size={20} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={m.woList.searchPlaceholder}
          size="lg"
          value={query}
        />

        <Text c="dimmed" size="sm">
          {fillMessage(m.woList.count, { n: shown.length })}
          {truncated ? ` ${m.common.separator} ${m.woList.truncated}` : ""}
        </Text>

        {shown.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="gray" radius="md" size={64} variant="light">
                <IconClipboardList size={36} />
              </ThemeIcon>
              <Text c="dimmed">
                {items.length === 0 ? m.woList.empty : m.woList.noMatch}
              </Text>
            </Stack>
          </Center>
        ) : (
          <Stack gap="sm">
            {shown.map((it) => (
              <UnstyledButton
                key={it.workOrderNumber}
                onClick={() =>
                  router.push(`/wo-scan/${it.workOrderNumber}?from=list`)
                }
              >
                <Paper p="md" radius="md" withBorder>
                  <Group
                    align="flex-start"
                    justify="space-between"
                    wrap="nowrap"
                  >
                    <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                      <Group gap="sm" wrap="nowrap">
                        <Text fw={700} size="lg">
                          {fillMessage(m.woScan.workOrder, {
                            n: it.workOrderNumber,
                          })}
                        </Text>
                        <Text c="dimmed" ff="monospace" size="sm" truncate>
                          {it.docNumber}
                        </Text>
                      </Group>
                      <Text fw={600} truncate>
                        {it.productName}
                      </Text>
                      <Group gap="md" wrap="wrap">
                        {it.productCode && (
                          <Text c="dimmed" ff="monospace" size="sm">
                            {it.productCode}
                          </Text>
                        )}
                        <Text c="dimmed" size="sm">
                          {fillMessage(m.woScan.plannedQty, {
                            n: it.plannedQuantity,
                          })}
                        </Text>
                      </Group>
                      {it.totalSteps > 0 && (
                        <Group align="center" gap="sm" wrap="nowrap">
                          <Progress
                            color={
                              it.doneSteps === it.totalSteps ? "teal" : "blue"
                            }
                            size="sm"
                            style={{ flex: 1 }}
                            value={(it.doneSteps / it.totalSteps) * 100}
                          />
                          <Text
                            c="dimmed"
                            size="sm"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {fillMessage(m.woScan.progress, {
                              done: it.doneSteps,
                              total: it.totalSteps,
                            })}
                          </Text>
                        </Group>
                      )}
                    </Stack>
                    <Badge
                      color={WO_STATUS_COLOR[it.status] ?? "gray"}
                      size="lg"
                      style={{ flexShrink: 0 }}
                      variant="light"
                    >
                      {statusLabel(it.status)}
                    </Badge>
                  </Group>
                </Paper>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
