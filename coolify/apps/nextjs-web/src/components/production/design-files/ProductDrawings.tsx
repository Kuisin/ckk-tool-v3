"use client";

/**
 * ProductDrawings — ある製品の設計図 (PD26)。**版を管理できる唯一の画面**。
 *
 * 系列（製品 × 受注元）ごとに節を分ける。汎用が先頭で、以降は版数の多い順。
 * 系列を混ぜて 1 本の表にすると「どの顧客の v3 なのか」が読めなくなる。
 * 並べ方は `lib/design-files-core.ts` の groupBySeries が決めるので、
 * 製品マスタ (MS24) と設計依頼 (SA26) の見え方と必ず一致する。
 *
 * 既存の版のファイルそのものは差し替えられない — 図面を変えるということは
 * 新しい版を作るということで、過去の版を書き換えると「何を見て作ったか」が
 * 追えなくなる。直せるのはメモだけ。
 */

import { Badge, Box, Group, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteDesignFile,
  updateDesignFileNotes,
} from "@/app/(dashboard)/production/design-files/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { DetailShell } from "@/components/ui/shells";
import { groupBySeries, pickThumbFile } from "@/lib/design-files-core";
import type { MemoView } from "@/lib/document-memos";
import { DesignFileList, type DesignFileListRow } from "./DesignFileList";
import type { ProductDesignFile } from "./model";

const BASE_PATH = "/production/design-files";

export function ProductDrawings({
  productId,
  productLabel,
  files,
  canManage,
  memosByFile = {},
}: {
  productId: number;
  productLabel: string;
  files: ProductDesignFile[];
  /** 版を足す・直す・消す権限があるか（無ければ読むだけ）。 */
  canManage: boolean;
  /**
   * 版 id → メモ（document_memos, ownerType "design_files"）。
   * 画面に並ぶ版ぶんをまとめて 1 回で引いたもの（listMemosByOwnerIds）。
   */
  memosByFile?: Record<string, MemoView[]>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DesignFileListRow | null>(null);
  const [notes, setNotes] = useState("");
  const [deleting, setDeleting] = useState<DesignFileListRow | null>(null);
  const [memoFor, setMemoFor] = useState<DesignFileListRow | null>(null);

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
          title: tr("common.error2"),
          message: res.error ?? tr("common.failed"),
          color: "red",
        });
      }
    });

  const openRequest = (n: string) =>
    router.push(`/sales/design-requests/${encodeURIComponent(n)}`);

  return (
    <DetailShell
      actions={
        canManage ? (
          <SecondaryButton
            href={`${BASE_PATH}/new?product=${productId}`}
            leftSection={<IconPlus size={14} />}
          >
            {tr("production.designFiles.registerAVersion")}
          </SecondaryButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("common.production"),
        tr("common.drawing"),
        productLabel,
      ]}
      title={productLabel}
    >
      <Stack gap="lg">
        {series.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("common.thereIsNoDrawingForThis")}
          </Text>
        ) : (
          series.map((g) => {
            const thumb = pickThumbFile(g.files);
            return (
              <Stack
                gap="xs"
                // 一覧の行から系列へ直接来られるようにアンカーを置く。
                id={`series-${g.customerBpId ?? "generic"}`}
                key={g.customerBpId ?? "__generic__"}
              >
                <Group gap="xs" wrap="wrap">
                  {g.customerBpId == null ? (
                    <Badge color="gray" variant="light">
                      {tr("common.generic")}
                    </Badge>
                  ) : (
                    <Badge color="blue" variant="light">
                      {g.files.find((f) => f.customerName)?.customerName ??
                        tr("common.orderingCustomer")}
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
                  onMemo={setMemoFor}
                  onOpenRequest={openRequest}
                  rows={g.files}
                  showSource
                />
              </Stack>
            );
          })
        )}
      </Stack>

      <ModalShell
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setEditing(null)}
        onConfirm={() =>
          editing &&
          run(
            () => updateDesignFileNotes({ id: editing.id, notes }),
            tr("common.saved2"),
          )
        }
        opened={editing != null}
        title={editing ? `v${editing.version} のメモ` : tr("common.memo")}
      >
        <Textarea
          autosize
          label={tr("common.memo")}
          minRows={3}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder={tr("production.designFiles.whatChangedInThisVersion")}
          value={notes}
        />
      </ModalShell>

      {/* 版ごとのメモ（リッチテキスト）。1 版 1 件の共有欄なので mode="memo"。
          モーダルの中でだけエディタを読み込む（prosemirror は重い）。 */}
      <ModalShell
        onClose={() => setMemoFor(null)}
        opened={memoFor != null}
        size="lg"
        title={memoFor ? `v${memoFor.version} のメモ` : tr("common.memo")}
      >
        {memoFor && (
          <MemoPanel
            memos={memosByFile[memoFor.id] ?? []}
            mode="memo"
            ownerId={memoFor.id}
            ownerType="design_files"
          />
        )}
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
          deleting &&
          run(() => deleteDesignFile(deleting.id), tr("common.deleted"))
        }
        opened={deleting != null}
        title={tr("production.designFiles.deleteTheDrawing")}
      />
    </DetailShell>
  );
}
