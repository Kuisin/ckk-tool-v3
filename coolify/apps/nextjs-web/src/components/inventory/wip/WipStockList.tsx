"use client";

/**
 * WipStockList — 在庫管理の「仕掛品」タブの一覧。
 *
 * 行は **材種 / 径 / 長（仕掛ブランク）→ 加工状態** でまとめる。「いまどの
 * ブランクが、どこまで加工された状態で、何本あるか」を上から読めるようにする
 * ため（更新日順のフラットな表だと同じブランクが散らばる）。並びは
 * lib/wip-stock-core.ts `groupWipStock` が決める。
 *
 * デスクトップは見出し行つきの表、モバイルは区切り線のカード列
 * （_specs/design.md §8.1 / §20.2）。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsExchange,
  IconCategory,
  IconPencil,
  IconProgress,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  groupWipStock,
  trimNumber,
  type WipBlankGroup,
  wipSizeLabel,
} from "@/lib/wip-stock-core";
import type { WipStockRow } from "./model";

const fmtQty = (n: number) => n.toLocaleString("ja-JP");

/** 加工状態の見せ方 — 呼び名があれば呼び名、無ければ工程名の並び。 */
export function WipStateLabel({
  row,
}: {
  row: Pick<WipStockRow, "isLegacy" | "stateName" | "stepNames">;
}) {
  const tr = useTranslations();
  if (row.isLegacy) {
    return (
      <Badge color="orange" variant="light">
        {tr("inventory.wip.unclassified")}
      </Badge>
    );
  }
  const steps =
    row.stepNames.length === 0 ? (
      <Badge color="gray" variant="light">
        {tr("inventory.wip.unprocessed")}
      </Badge>
    ) : (
      <Group gap={4} wrap="wrap">
        {row.stepNames.map((n, i) => (
          // 同じ工程が 2 回入り得る（手直しでもう一度通した）ので位置も鍵に入れる。
          // 「›」は次の工程と 1 組で折り返す（行末に矢印だけ残さない）。
          <Group gap={4} key={`${i}:${n}`} wrap="nowrap">
            {i > 0 && (
              <Text c="dimmed" component="span" size="xs">
                ›
              </Text>
            )}
            <Badge color="violet" variant="light">
              {n}
            </Badge>
          </Group>
        ))}
      </Group>
    );
  if (!row.stateName) return steps;
  return (
    <Stack gap={2}>
      <Text fw={600} size="sm">
        {row.stateName}
      </Text>
      {steps}
    </Stack>
  );
}

function storageLabel(
  tr: (key: string) => string,
  r: Pick<WipStockRow, "plantName" | "storageLocationName" | "shelfCode">,
): string {
  const storage = !r.storageLocationName
    ? tr("common.unassigned")
    : r.shelfCode
      ? `${r.storageLocationName} / ${r.shelfCode}`
      : r.storageLocationName;
  return `${r.plantName ?? tr("production.inventory.noSiteSet")} / ${storage}`;
}

export interface WipStockListProps {
  rows: WipStockRow[];
  /** 名前を付ける・分類する を出すか（在庫の調整権限）。 */
  canAdjust: boolean;
  onTransfer: (row: WipStockRow) => void;
  onReclassify: (row: WipStockRow) => void;
  onRename: (row: WipStockRow) => void;
}

export function WipStockList({
  rows,
  canAdjust,
  onTransfer,
  onReclassify,
  onRename,
}: WipStockListProps) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconProgress size={24} />}
        message={tr("inventory.wip.empty")}
      />
    );
  }

  const groups = groupWipStock(rows);
  const open = (r: WipStockRow) => router.push(`/inventory/products/${r.id}`);

  const groupTitle = (g: WipBlankGroup<WipStockRow>): ReactNode => {
    if (g.unclassified) {
      return (
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {tr("inventory.wip.unclassified")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("inventory.wip.unclassifiedHint")}
          </Text>
        </Stack>
      );
    }
    const first = g.states[0].rows[0];
    return (
      <Group gap="sm" wrap="wrap">
        <Text fw={600} size="sm">
          {first.materialTypeLabel ?? "—"}
        </Text>
        <Text className="tabular-nums" fw={600} size="sm">
          {wipSizeLabel(g.diameterMm, g.lengthMm)}
        </Text>
      </Group>
    );
  };

  const finished = (r: WipStockRow) =>
    wipSizeLabel(r.finishedDiameterMm, r.finishedLengthMm) ?? "—";

  const aimed = (r: WipStockRow): ReactNode =>
    r.aimedProductName ? (
      <>
        <Text size="sm">{r.aimedProductName}</Text>
        {r.aimedProductCode && (
          <Text c="dimmed" ff="mono" size="xs">
            {r.aimedProductCode}
          </Text>
        )}
      </>
    ) : (
      "—"
    );

  const source = (r: WipStockRow): string =>
    r.sourceWorkOrderNumber != null && r.sourceStepName
      ? tr("inventory.wip.sourceStepValue", {
          number: r.sourceWorkOrderNumber,
          stepName: r.sourceStepName,
        })
      : "—";

  const age = (r: WipStockRow): string =>
    r.ageDays != null ? tr("inventory.wip.ageDays", { days: r.ageDays }) : "—";

  const renameButton = (r: WipStockRow) =>
    canAdjust && !r.isLegacy ? (
      <Tooltip label={tr("inventory.wip.nameState")} withinPortal>
        <ActionIcon
          aria-label={tr("inventory.wip.nameState")}
          color="gray"
          onClick={(e) => {
            e.stopPropagation();
            onRename(r);
          }}
          size="sm"
          variant="subtle"
        >
          <IconPencil size={14} />
        </ActionIcon>
      </Tooltip>
    ) : null;

  const actions = (r: WipStockRow, fullWidth: boolean) => (
    <Group gap="xs" justify="flex-end" wrap="nowrap">
      {canAdjust && r.isLegacy && r.available > 0 && (
        <SecondaryButton
          fullWidth={fullWidth}
          leftSection={<IconCategory size={14} />}
          onClick={(e) => {
            e.stopPropagation();
            onReclassify(r);
          }}
          size="xs"
        >
          {tr("inventory.wip.reclassify.action")}
        </SecondaryButton>
      )}
      <GhostButton
        fullWidth={fullWidth}
        leftSection={<IconArrowsExchange size={14} />}
        onClick={(e) => {
          e.stopPropagation();
          onTransfer(r);
        }}
        size="xs"
      >
        {tr("production.inventory.move2")}
      </GhostButton>
    </Group>
  );

  if (isMobile) {
    return (
      <Stack gap="md">
        {groups.map((g) => (
          <Box key={g.key}>
            <Group
              align="flex-start"
              bg="var(--mantine-color-default-hover)"
              justify="space-between"
              p="xs"
              wrap="nowrap"
            >
              <div className="min-w-0">{groupTitle(g)}</div>
              <Text className="shrink-0 tabular-nums" fw={600} size="sm">
                {tr("inventory.wip.groupTotal", {
                  quantity: fmtQty(g.quantity),
                })}
              </Text>
            </Group>
            {g.states.flatMap((s) =>
              s.rows.map((r, i) => (
                <Box key={r.id}>
                  <Divider />
                  <Stack gap={6} py="sm">
                    <Box
                      onClick={() => open(r)}
                      style={{ cursor: "pointer", minWidth: 0 }}
                    >
                      <Stack gap={4}>
                        <Group gap="xs" justify="space-between" wrap="nowrap">
                          <div className="min-w-0">
                            <WipStateLabel row={r} />
                          </div>
                          {i === 0 && renameButton(r)}
                        </Group>
                        <Text className="tabular-nums" size="xs">
                          {tr("inventory.wip.finishedSize")}: {finished(r)}
                        </Text>
                        <Text className="tabular-nums" size="xs">
                          {tr("inventory.wip.onHandAndAvailable", {
                            quantity: fmtQty(r.quantity),
                            available: fmtQty(r.available),
                          })}
                        </Text>
                        <Text c="dimmed" size="xs">
                          {storageLabel(tr, r)}
                          {r.lotNumber != null &&
                            ` / ${tr("production.inventory.lotN", { number: r.lotNumber })}`}
                        </Text>
                        {r.aimedProductName && (
                          <Text c="dimmed" size="xs" truncate>
                            {tr("inventory.wip.aimedProduct")}:{" "}
                            {r.aimedProductName}
                          </Text>
                        )}
                        <Text c="dimmed" size="xs">
                          {tr("inventory.wip.sourceStep")}: {source(r)} /{" "}
                          {tr("inventory.wip.age")}: {age(r)}
                        </Text>
                      </Stack>
                    </Box>
                    {actions(r, true)}
                  </Stack>
                </Box>
              )),
            )}
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <Table.ScrollContainer minWidth={1100}>
      <Table highlightOnHover={false} striped={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th miw={240}>{tr("inventory.wip.state")}</Table.Th>
            <Table.Th w={120}>{tr("inventory.wip.finishedSize")}</Table.Th>
            <Table.Th ta="right" w={70}>
              {tr("common.quantity")}
            </Table.Th>
            <Table.Th ta="right" w={70}>
              {tr("inventory.wip.reserved")}
            </Table.Th>
            <Table.Th ta="right" w={85}>
              {tr("common.available")}
            </Table.Th>
            <Table.Th w={170}>{tr("inventory.wip.siteAndStorage")}</Table.Th>
            <Table.Th ta="right" w={70}>
              {tr("common.lot")}
            </Table.Th>
            <Table.Th w={170}>{tr("inventory.wip.aimedProduct")}</Table.Th>
            <Table.Th w={150}>{tr("inventory.wip.sourceStep")}</Table.Th>
            <Table.Th ta="right" w={80}>
              {tr("inventory.wip.age")}
            </Table.Th>
            <Table.Th w={190} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <Table.Tr bg="var(--mantine-color-default-hover)">
                <Table.Td colSpan={2}>{groupTitle(g)}</Table.Td>
                <Table.Td className="tabular-nums" ta="right">
                  <Text fw={600} size="sm">
                    {fmtQty(g.quantity)}
                  </Text>
                </Table.Td>
                <Table.Td className="tabular-nums" ta="right">
                  <Text fw={600} size="sm">
                    {fmtQty(g.reservedQuantity)}
                  </Text>
                </Table.Td>
                <Table.Td className="tabular-nums" ta="right">
                  <Text fw={600} size="sm">
                    {fmtQty(g.quantity - g.reservedQuantity)}
                  </Text>
                </Table.Td>
                <Table.Td colSpan={6} />
              </Table.Tr>
              {g.states.flatMap((s) =>
                s.rows.map((r, i) => (
                  <Table.Tr
                    data-wip-row={r.id}
                    key={r.id}
                    onClick={() => open(r)}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <WipStateLabel row={r} />
                        {i === 0 && renameButton(r)}
                      </Group>
                    </Table.Td>
                    <Table.Td className="tabular-nums">{finished(r)}</Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {fmtQty(r.quantity)}
                    </Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {r.reservedQuantity > 0 ? (
                        <Text c="orange" size="sm">
                          {fmtQty(r.reservedQuantity)}
                        </Text>
                      ) : (
                        "0"
                      )}
                    </Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {fmtQty(r.available)}
                    </Table.Td>
                    <Table.Td>
                      <Text
                        c={r.storageLocationName ? undefined : "dimmed"}
                        size="sm"
                      >
                        {storageLabel(tr, r)}
                      </Text>
                    </Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {r.lotNumber != null ? (
                        <Text ff="mono" size="sm">
                          {r.lotNumber}
                        </Text>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>{aimed(r)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{source(r)}</Text>
                    </Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {age(r)}
                    </Table.Td>
                    <Table.Td>{actions(r, false)}</Table.Td>
                  </Table.Tr>
                )),
              )}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** 在庫移動モーダルに渡す品目ラベル（仕掛ブランクの寸法 + 加工状態）。 */
export function wipTransferLabel(
  tr: (key: string) => string,
  r: WipStockRow,
): string {
  const size =
    r.diameterMm != null && r.lengthMm != null
      ? `φ${trimNumber(r.diameterMm)} × ${trimNumber(r.lengthMm)}`
      : null;
  const state = r.isLegacy
    ? tr("inventory.wip.unclassified")
    : (r.stateName ??
      (r.stepNames.length > 0
        ? r.stepNames.join(" › ")
        : tr("inventory.wip.unprocessed")));
  const head = size
    ? `${r.materialTypeLabel ?? r.itemName} ${size}`
    : (r.aimedProductName ?? r.itemName);
  return `${head}（${state}）`;
}
