"use client";

/**
 * AttachmentsPanel — 汎用証憑（document_attachments）パネル。
 *
 * 任意の業務レコード（素材発注書 / 素材入荷 / 受注請書 …）に紐付く添付
 * ファイルの一覧 + アップロード + 削除。データは server 側で
 * `lib/attachments.listAttachments` が用意し、mutation は
 * `/api/attachments/upload`（POST multipart）と `/api/attachments/[id]`
 * （DELETE）へ fetch する。成功時は router.refresh() で一覧を再取得。
 *
 * ファイル名リンクは `/api/attachments/[id]`（PDF/画像は inline 表示、
 * その他はダウンロード）。
 */

import {
  ActionIcon,
  Anchor,
  Badge,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconFile,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconPaperclip,
  IconPhoto,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { formatDateTime } from "@/lib/format";

/** 一覧 1 行の view model（server 側 listAttachments が生成）。 */
export interface AttachmentView {
  /** files テーブルの id（design_files 連携用）。 */
  fileId: string;
  id: string;
  filename: string;
  /** 表示区分（注文書控え 等）。 */
  label: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  /** ISO タイムスタンプ。 */
  createdAt: string;
}

/** アップロード可能な拡張子（lib/attachments.ts のホワイトリストと同一）。 */
export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.csv";

/** 最大ファイルサイズ（lib/attachments.ts の MAX_ATTACHMENT_BYTES と同一）。 */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** MIME に応じたファイルアイコン（色 + アイコン）。 */
function fileIcon(mimeType: string): {
  color: string;
  icon: React.ReactNode;
} {
  if (mimeType === "application/pdf") {
    return { color: "red", icon: <IconFileTypePdf size={18} /> };
  }
  if (mimeType.startsWith("image/")) {
    return { color: "blue", icon: <IconPhoto size={18} /> };
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) {
    return { color: "green", icon: <IconFileSpreadsheet size={18} /> };
  }
  return { color: "gray", icon: <IconFile size={18} /> };
}

export function AttachmentsPanel({
  ownerType,
  ownerId,
  attachments,
  canUpload = false,
  canDelete = false,
  title = "添付ファイル",
}: {
  /** 添付対象のテーブル名（@@map 値）。例: "material_purchase_orders" */
  ownerType: string;
  /** 添付対象の業務キー（PO 番号 / uuid）。 */
  ownerId: string;
  attachments: AttachmentView[];
  canUpload?: boolean;
  canDelete?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectFile = (file: File | null) => {
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      notifications.show({
        title: "エラー",
        message: "ファイルサイズは 20MB 以下にしてください",
        color: "red",
      });
      return;
    }
    setLabel("");
    setPendingFile(file);
  };

  const upload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("ownerType", ownerType);
      body.set("ownerId", ownerId);
      if (label.trim()) body.set("label", label.trim());
      body.set("file", pendingFile);
      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        notifications.show({
          title: "添付しました",
          message: pendingFile.name,
          color: "green",
        });
        setPendingFile(null);
        setLabel("");
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: json?.error ?? "アップロードに失敗しました",
          color: "red",
        });
      }
    } catch {
      notifications.show({
        title: "エラー",
        message: "アップロードに失敗しました",
        color: "red",
      });
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/attachments/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        notifications.show({
          title: "削除しました",
          message: deleteTarget.filename,
          color: "green",
        });
        setDeleteTarget(null);
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: json?.error ?? "削除に失敗しました",
          color: "red",
        });
      }
    } catch {
      notifications.show({
        title: "エラー",
        message: "削除に失敗しました",
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={5}>
          {title}
          {attachments.length > 0 && (
            <Text c="dimmed" className="tabular-nums" ml={6} size="sm" span>
              {attachments.length} 件
            </Text>
          )}
        </Title>
        {canUpload && (
          <FileButton accept={ATTACHMENT_ACCEPT} onChange={selectFile}>
            {(props) => (
              <SecondaryButton
                leftSection={<IconUpload size={14} />}
                {...props}
              >
                アップロード
              </SecondaryButton>
            )}
          </FileButton>
        )}
      </Group>

      {attachments.length === 0 ? (
        <EmptyState
          icon={<IconPaperclip size={24} />}
          message="添付ファイルはありません"
        />
      ) : (
        <Stack gap="xs">
          {attachments.map((a) => {
            const { color, icon } = fileIcon(a.mimeType);
            return (
              <Paper key={a.id} p="sm" radius="sm" withBorder>
                <Group gap="sm" justify="space-between" wrap="nowrap">
                  <Group className="min-w-0" gap="sm" wrap="nowrap">
                    <ThemeIcon
                      color={color}
                      radius="sm"
                      size="lg"
                      variant="light"
                    >
                      {icon}
                    </ThemeIcon>
                    <Stack className="min-w-0" gap={2}>
                      <Group gap="xs" wrap="nowrap">
                        <Anchor
                          fw={600}
                          href={`/api/attachments/${a.id}`}
                          rel="noopener noreferrer"
                          size="sm"
                          target="_blank"
                          truncate
                        >
                          {a.filename}
                        </Anchor>
                        {a.label && (
                          <Badge
                            className="shrink-0"
                            color="blue"
                            size="xs"
                            variant="light"
                          >
                            {a.label}
                          </Badge>
                        )}
                      </Group>
                      <Text c="dimmed" size="xs">
                        {formatBytes(a.sizeBytes)} ・{" "}
                        {formatDateTime(a.createdAt)}（{a.uploadedBy}）
                      </Text>
                    </Stack>
                  </Group>
                  {canDelete && (
                    <ActionIcon
                      aria-label={`${a.filename} を削除`}
                      color="red"
                      onClick={() => setDeleteTarget(a)}
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* アップロード（ラベル入力 → 確定で POST） */}
      <ModalShell
        confirmLabel="アップロード"
        loading={uploading}
        onClose={() => setPendingFile(null)}
        onConfirm={upload}
        opened={pendingFile !== null}
        size="sm"
        title="証憑のアップロード"
      >
        <Text ff="mono" size="sm" style={{ wordBreak: "break-all" }}>
          {pendingFile?.name}
          <Text c="dimmed" ml={6} size="xs" span>
            {pendingFile ? formatBytes(pendingFile.size) : ""}
          </Text>
        </Text>
        <TextInput
          label="ラベル（任意）"
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="注文書控え 等"
          value={label}
        />
      </ModalShell>

      {/* 削除の確認 */}
      <ModalShell
        confirmColor="red"
        confirmLabel="削除する"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        opened={deleteTarget !== null}
        size="sm"
        title="添付ファイル削除の確認"
      >
        <Text size="sm">
          {deleteTarget?.filename} を削除します。この操作は取り消せません。
        </Text>
      </ModalShell>
    </Stack>
  );
}
