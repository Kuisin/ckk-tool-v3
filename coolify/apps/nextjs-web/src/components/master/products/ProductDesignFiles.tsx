"use client";

/**
 * ProductDesignFiles — 製品の設計図 (MS24 関連タブ)。
 *
 * 版は **(製品 × 受注元)** ごとの系列で育つので、系列ごとに見出しを付けて
 * 分ける。汎用（受注元なし）が先頭で、以降は版数の多い順。系列を混ぜて
 * 1 本の表にすると「どの顧客の v3 なのか」が読めなくなる。
 *
 * ここは**読む + 版を足す**画面。既存の版の中身（ファイルそのもの）は
 * 差し替えられない — 図面を変えるということは新しい版を作るということで、
 * 過去の版を書き換えると「何を見て作ったか」が追えなくなる。
 */

import { Badge, Box, Group, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteDesignFile,
  updateDesignFileNotes,
} from "@/app/(dashboard)/master/products/design-actions";
import {
  DesignFileList,
  type DesignFileListRow,
} from "@/components/sales/design-requests/DesignFileList";
import type { ProductDesignFile } from "@/components/sales/design-requests/model";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { groupBySeries } from "@/lib/design-files-core";
import { AddDesignVersionModal } from "./AddDesignVersionModal";

interface Option {
  value: string;
  label: string;
}

export function ProductDesignFiles({
  productId,
  files,
  customerOptions,
  canManage,
}: {
  productId: number;
  files: ProductDesignFile[];
  customerOptions: Option[];
  /** 版を足す・直す権限があるか（無ければ読むだけ）。 */
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DesignFileListRow | null>(null);
  const [notes, setNotes] = useState("");
  const [deleting, setDeleting] = useState<DesignFileListRow | null>(null);

  const series = groupBySeries(files);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        notifications.show({ title: ok, message: "", color: "green" });
        setEditing(null);
        setDeleting(null);
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: res.error ?? "失敗しました",
          color: "red",
        });
      }
    });

  const openRequest = (n: string) =>
    router.push(`/sales/design-requests/${encodeURIComponent(n)}`);

  return (
    <Stack gap="md">
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Text fw={600} size="sm">
          設計図
        </Text>
        {canManage && (
          <SecondaryButton
            leftSection={<IconPlus size={14} />}
            onClick={() => setAddOpen(true)}
          >
            設計図を追加
          </SecondaryButton>
        )}
      </Group>

      {series.length === 0 ? (
        <Text c="dimmed" size="sm">
          この製品の設計図はまだありません
        </Text>
      ) : (
        series.map((g) => {
          // 系列の中で「いま見せたい 1 枚」— プレビューがあればそれ、
          // 無ければ最新の図面データ。
          const latest = g.files.filter((f) => f.isLatest);
          const thumb =
            latest.find((f) => f.role === "PREVIEW") ??
            latest.find((f) => f.role === "BLUEPRINT") ??
            null;
          return (
            <Stack gap="xs" key={g.customerBpId ?? "__generic__"}>
              <Group gap="xs" wrap="wrap">
                {g.customerBpId == null ? (
                  <Badge color="gray" variant="light">
                    汎用
                  </Badge>
                ) : (
                  <Badge color="blue" variant="light">
                    {g.files.find((f) => f.customerName)?.customerName ??
                      "受注元"}
                  </Badge>
                )}
                <Text c="dimmed" size="xs">
                  最新 v{g.latestVersion}
                </Text>
              </Group>
              {thumb && (
                <Box maw={320}>
                  <DesignFileThumb
                    target={{
                      caption: `v${thumb.version}（最新）`,
                      filename: thumb.filename,
                      mimeType: thumb.mimeType,
                      src: `/api/design-files/${encodeURIComponent(thumb.id)}`,
                    }}
                  />
                </Box>
              )}
              <DesignFileList
                onDelete={canManage ? setDeleting : undefined}
                onEdit={
                  canManage
                    ? (row) => {
                        setEditing(row);
                        setNotes(row.notes ?? "");
                      }
                    : undefined
                }
                onOpenRequest={openRequest}
                rows={g.files}
                showSource
              />
            </Stack>
          );
        })
      )}

      <AddDesignVersionModal
        customerOptions={customerOptions}
        onClose={() => setAddOpen(false)}
        opened={addOpen}
        productId={productId}
      />

      <ModalShell
        confirmLabel="保存"
        loading={isPending}
        onClose={() => setEditing(null)}
        onConfirm={() =>
          editing &&
          run(
            () => updateDesignFileNotes({ id: editing.id, notes }),
            "保存しました",
          )
        }
        opened={editing != null}
        title={editing ? `v${editing.version} のメモ` : "メモ"}
      >
        <Textarea
          autosize
          label="メモ"
          minRows={3}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="この版で何が変わったか"
          value={notes}
        />
      </ModalShell>

      <ConfirmModal
        confirmLabel="削除"
        loading={isPending}
        message={
          deleting
            ? `${deleting.filename}（v${deleting.version}）を削除します。この操作は取り消せません。`
            : ""
        }
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && run(() => deleteDesignFile(deleting.id), "削除しました")
        }
        opened={deleting != null}
        title="設計図の削除"
      />
    </Stack>
  );
}
