"use client";

/**
 * FileManager — admin document storage (SeaweedFS) browser.
 *
 * Lists stored objects (incoming uploads + generated PDFs), with view /
 * download / delete per file and a simple upload. All storage access is proxied
 * through /api/admin/files (the filer is not reachable from the browser).
 *
 * Admin-only tool for now — no per-user RBAC gate yet (see the API route note).
 */

import {
  Alert,
  Badge,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconDownload,
  IconEye,
  IconFile,
  IconFileTypePdf,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { openConfirm } from "@/components/ui/modals";
import { ListShell } from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";

interface StoredFile {
  key: string;
  name: string;
  size: number;
  mime: string;
  mtime: string | null;
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1,
  );
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/** Top-level folder of a key (e.g. `pdfs/quotes/x.pdf` → `pdfs`). */
function topFolder(key: string): string {
  return key.includes("/") ? key.split("/")[0] : "(ルート)";
}

function FileIcon({ mime, name }: { mime: string; name: string }) {
  const isPdf = mime.includes("pdf") || name.toLowerCase().endsWith(".pdf");
  const isImg =
    mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
  if (isPdf)
    return <IconFileTypePdf color="var(--mantine-color-red-6)" size={18} />;
  if (isImg) return <IconPhoto color="var(--mantine-color-blue-6)" size={18} />;
  return <IconFile color="var(--mantine-color-gray-6)" size={18} />;
}

export function FileManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/files");
      const json = await res.json();
      setFiles(json.files ?? []);
      setStorageOk(json.storageOk !== false);
    } catch {
      setStorageOk(false);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const folders = useMemo(() => {
    const set = new Set(files.map((f) => topFolder(f.key)));
    return [...set].sort();
  }, [files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) =>
        (!folder || topFolder(f.key) === folder) &&
        (!q || f.key.toLowerCase().includes(q)),
    );
  }, [files, query, folder]);

  async function onUpload(file: File | null | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("prefix", "uploads");
      const res = await fetch("/api/admin/files", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      notifications.show({
        title: "アップロードしました",
        message: file.name,
        color: "green",
      });
      await reload();
    } catch (err) {
      notifications.show({
        title: "アップロード失敗",
        message: err instanceof Error ? err.message : "不明なエラー",
        color: "red",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(file: StoredFile) {
    try {
      const res = await fetch(
        `/api/admin/files?key=${encodeURIComponent(file.key)}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      notifications.show({
        title: "削除しました",
        message: file.name,
        color: "green",
      });
      setFiles((prev) => prev.filter((f) => f.key !== file.key));
    } catch (err) {
      notifications.show({
        title: "削除失敗",
        message: err instanceof Error ? err.message : "不明なエラー",
        color: "red",
      });
    }
  }

  const rawHref = (key: string, download = false) =>
    `/api/admin/files/raw?key=${encodeURIComponent(key)}${download ? "&download=1" : ""}`;

  const columns: Column<StoredFile>[] = [
    {
      key: "name",
      header: "ファイル名",
      render: (f) => (
        <Group gap="xs" wrap="nowrap">
          <FileIcon mime={f.mime} name={f.name} />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" truncate>
              {f.name}
            </Text>
            <Text c="dimmed" ff="mono" size="xs" truncate>
              {f.key}
            </Text>
          </Stack>
        </Group>
      ),
      sortValue: (f) => f.name,
      sortable: true,
    },
    {
      key: "folder",
      header: "区分",
      render: (f) => (
        <Badge color="gray" variant="light">
          {topFolder(f.key)}
        </Badge>
      ),
      sortValue: (f) => topFolder(f.key),
      sortable: true,
      hideable: true,
    },
    {
      key: "size",
      header: "サイズ",
      align: "right",
      render: (f) => (
        <Text className="tabular-nums" size="sm">
          {formatBytes(f.size)}
        </Text>
      ),
      sortValue: (f) => f.size,
      sortable: true,
    },
    {
      key: "mtime",
      header: "更新日時",
      render: (f) => (
        <Text c="dimmed" size="sm">
          {formatDateTime(f.mtime)}
        </Text>
      ),
      sortValue: (f) => f.mtime ?? "",
      sortable: true,
      hideable: true,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <GhostButton
            external
            href={rawHref(f.key)}
            leftSection={<IconEye size={14} />}
            size="xs"
          >
            表示
          </GhostButton>
          <GhostButton
            external
            href={rawHref(f.key, true)}
            leftSection={<IconDownload size={14} />}
            size="xs"
          >
            DL
          </GhostButton>
          <GhostButton
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() =>
              openConfirm({
                title: "ファイルの削除",
                message: `「${f.name}」を削除します。この操作は取り消せません。`,
                confirmLabel: "削除",
                onConfirm: () => onDelete(f),
              })
            }
            size="xs"
          >
            削除
          </GhostButton>
        </Group>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs">
          <GhostButton
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={reload}
          >
            更新
          </GhostButton>
          <PrimaryButton
            leftSection={<IconUpload size={16} />}
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            アップロード
          </PrimaryButton>
          <input
            hidden
            onChange={(e) => onUpload(e.target.files?.[0])}
            ref={inputRef}
            type="file"
          />
        </Group>
      }
      breadcrumbs={["管理", "ファイル管理"]}
      filters={
        <Select
          clearable
          data={folders}
          onChange={setFolder}
          placeholder="区分で絞り込み"
          value={folder}
          w={200}
        />
      }
      onReset={() => {
        setQuery("");
        setFolder(null);
      }}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="ファイル名・パスで検索"
          value={query}
        />
      }
      title="ファイル管理"
    >
      {!storageOk && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          mb="sm"
          variant="light"
        >
          ストレージ（SeaweedFS）に接続できません。SEAWEED_FILER_URL
          とコンテナの稼働状況をご確認ください。
        </Alert>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            読み込み中…
          </Text>
        </Group>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          defaultSort={{ key: "mtime", dir: "desc" }}
          emptyIcon={<IconFile size={22} />}
          emptyMessage={
            storageOk
              ? "保存されたファイルはありません"
              : "ストレージに接続できません"
          }
          getRowId={(f) => f.key}
          pageSize={20}
        />
      )}
    </ListShell>
  );
}
