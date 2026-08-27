"use client";

/**
 * DesignFileList — 登録済みの版（design_files）の一覧。
 *
 * 設計依頼 (SA26) の「ファイル」タブと製品マスタ (MS24) の「関連」タブが
 * **同じ表**を出す。片方だけ直して見え方がずれるのを防ぐため 1 つにまとめた。
 * 出す列は渡ってきたデータで決まる — 備考のある行が 1 つでもあれば備考列、
 * `onOpenRequest` が渡っていれば元依頼列。
 *
 * モバイルは表をやめて 1 行 = 1 ブロックにする（design.md §20.2）。
 * バージョン + 役割 + 最新 のバッジだけで 3 つ並ぶので、横 375px に
 * 4 列を詰めると 1 列 40px になり何も読めない。
 */

import {
  Anchor,
  Badge,
  Box,
  Divider,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton } from "@/components/ui/buttons";
import { DesignFileViewButton } from "@/components/ui/DesignFileViewer";
import { useIsMobile } from "@/hooks/useViewport";
import { isViewable } from "@/lib/design-file-kind";
import {
  canDeleteDesignFile,
  canEditDesignFile,
  DESIGN_FILE_SOURCE_COLOR,
  DESIGN_FILE_SOURCE_LABEL,
  describeLock,
  designFileSource,
} from "@/lib/design-files-core";
import type { DesignFileRole } from "./model";
import { RoleBadge } from "./RoleBadge";

/** 版 1 行。SA26 の DesignRequestFile と MS24 の ProductDesignFile の共通部分。 */
export interface DesignFileListRow {
  id: string;
  version: number;
  isLatest: boolean;
  role: DesignFileRole;
  filename: string;
  mimeType: string;
  notes?: string | null;
  /** 生成元の設計依頼（DSG-…）。手動登録の版や SA26 自身では渡さない。 */
  requestNumber?: string | null;
  /** 依頼 id。渡すと「依頼 / 手動」のタグを出す。 */
  designRequestId?: string | null;
  /** 指示書が指している版か（編集・削除の可否）。 */
  usedByWorkOrder?: boolean;
  createdAt: string;
}

const fileHref = (id: string) => `/api/design-files/${encodeURIComponent(id)}`;

export function DesignFileList({
  rows,
  onOpenRequest,
  onEdit,
  onDelete,
  showSource,
}: {
  rows: DesignFileListRow[];
  /** 渡すと元依頼列（モバイルでは行内リンク）を出す。 */
  onOpenRequest?: (requestNumber: string) => void;
  /** 渡すと行に操作を出す。可否は design-files-core が決める。 */
  onEdit?: (row: DesignFileListRow) => void;
  onDelete?: (row: DesignFileListRow) => void;
  /** 「依頼 / 手動」のタグを出すか（製品マスタでは出す）。 */
  showSource?: boolean;
}) {
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const showNotes = rows.some((r) => r.notes);

  // 行ごとの操作。使われている版・依頼の成果物は落ちる（判定は 1 箇所）。
  const actionsFor = (f: DesignFileListRow) => {
    const state = {
      usedByWorkOrder: f.usedByWorkOrder ?? false,
      designRequestId: f.designRequestId ?? null,
    };
    return {
      canEdit: onEdit != null && canEditDesignFile(state),
      canDelete: onDelete != null && canDeleteDesignFile(state),
      lock: describeLock(state),
    };
  };

  const sourceBadge = (f: DesignFileListRow) => {
    if (!showSource) return null;
    const src = designFileSource({
      designRequestId: f.designRequestId ?? null,
    });
    return (
      <Badge color={DESIGN_FILE_SOURCE_COLOR[src]} size="xs" variant="outline">
        {DESIGN_FILE_SOURCE_LABEL[src]}
      </Badge>
    );
  };

  const rowActions = (f: DesignFileListRow) => {
    const { canEdit, canDelete, lock } = actionsFor(f);
    if (!canEdit && !canDelete) {
      // 触れない理由は黙って隠さず、その場に出す。
      return lock && (onEdit || onDelete) ? (
        <Text c="dimmed" size="xs">
          {lock}
        </Text>
      ) : null;
    }
    return (
      <Group gap="xs" wrap="nowrap">
        {canEdit && (
          <GhostButton
            leftSection={<IconPencil size={14} />}
            onClick={() => onEdit?.(f)}
          >
            メモ
          </GhostButton>
        )}
        {canDelete && (
          <GhostButton
            c="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => onDelete?.(f)}
          >
            削除
          </GhostButton>
        )}
      </Group>
    );
  };

  if (isMobile) {
    return (
      <Stack gap={0}>
        {rows.map((f, i) => (
          <Box key={f.id}>
            {i > 0 && <Divider />}
            <Stack gap={6} py="sm">
              <Group gap="xs" justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="wrap">
                  <Text className="tabular-nums" fw={600} size="sm">
                    v{f.version}
                  </Text>
                  <RoleBadge role={f.role} />
                  {f.isLatest && <RoleBadge latest />}
                  {sourceBadge(f)}
                </Group>
                <Text c="dimmed" className="shrink-0 tabular-nums" size="xs">
                  {fmt.date(f.createdAt)}
                </Text>
              </Group>
              {/* 版の実体は design_files → files（証憑ではない）ので専用ルートで開く。 */}
              <Anchor href={fileHref(f.id)} size="sm" target="_blank" truncate>
                {f.filename}
              </Anchor>
              <Text c="dimmed" size="xs">
                {f.mimeType}
              </Text>
              {f.notes && <Text size="xs">{f.notes}</Text>}
              {f.requestNumber && onOpenRequest && (
                <Anchor
                  onClick={() => onOpenRequest(f.requestNumber ?? "")}
                  size="xs"
                >
                  {f.requestNumber}
                </Anchor>
              )}
              {isViewable(f.filename, f.mimeType) && (
                <DesignFileViewButton
                  fullWidth
                  target={{
                    caption: `v${f.version}${f.isLatest ? "（最新）" : ""}`,
                    filename: f.filename,
                    mimeType: f.mimeType,
                    src: fileHref(f.id),
                  }}
                />
              )}
              {rowActions(f)}
            </Stack>
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={250}>バージョン</Table.Th>
            <Table.Th>ファイル名</Table.Th>
            {showNotes && <Table.Th>備考</Table.Th>}
            {onOpenRequest && <Table.Th w={170}>元依頼</Table.Th>}
            <Table.Th w={150}>登録日時</Table.Th>
            {(onEdit || onDelete) && <Table.Th w={170}>操作</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((f) => (
            <Table.Tr key={f.id}>
              <Table.Td className="tabular-nums">
                <Group gap="xs" wrap="nowrap">
                  v{f.version}
                  <RoleBadge role={f.role} />
                  {f.isLatest && <RoleBadge latest />}
                  {sourceBadge(f)}
                </Group>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <Stack className="min-w-0" gap={0}>
                    <Anchor
                      href={fileHref(f.id)}
                      size="sm"
                      target="_blank"
                      truncate
                    >
                      {f.filename}
                    </Anchor>
                    <Text c="dimmed" size="xs">
                      {f.mimeType}
                    </Text>
                  </Stack>
                  {isViewable(f.filename, f.mimeType) && (
                    <Box className="shrink-0">
                      <DesignFileViewButton
                        target={{
                          caption: `v${f.version}${f.isLatest ? "（最新）" : ""}`,
                          filename: f.filename,
                          mimeType: f.mimeType,
                          src: fileHref(f.id),
                        }}
                      />
                    </Box>
                  )}
                </Group>
              </Table.Td>
              {showNotes && (
                <Table.Td>
                  <Text c={f.notes ? undefined : "dimmed"} size="sm">
                    {f.notes || "—"}
                  </Text>
                </Table.Td>
              )}
              {onOpenRequest && (
                <Table.Td>
                  {f.requestNumber ? (
                    <Anchor
                      onClick={() => onOpenRequest(f.requestNumber ?? "")}
                      size="sm"
                    >
                      {f.requestNumber}
                    </Anchor>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </Table.Td>
              )}
              <Table.Td className="tabular-nums">
                {fmt.dateTime(f.createdAt)}
              </Table.Td>
              {(onEdit || onDelete) && <Table.Td>{rowActions(f)}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
