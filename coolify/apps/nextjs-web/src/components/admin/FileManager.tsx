"use client";

/**
 * FileManager — ファイル管理 (SY06)。SeaweedFS のオブジェクトを Finder 風に
 * ブラウズする。
 *
 * - フォルダ階層ナビゲーション（パンくず + フォルダを開いて掘る）
 * - 表示切替: リスト / アイコン / カラム（Miller columns）
 * - システムファイル（OS・ツールの残骸 — `.DS_Store` / `*.tmp` 等。
 *   lib/system-files.ts）の表示/非表示トグル。業務ファイル（PDF・添付）は
 *   システムファイルではないので既定で表示される。
 * - 右側プレビューペイン（画像 / PDF はインライン、他はメタデータ）
 * - フォルダ単位のユーザー権限付与（管理者のみ — FolderGrantsModal）
 *
 * 認可はすべて /api/admin/files（lib/file-access.ts）側 — ここに来る一覧は
 * すでに閲覧可能なファイルだけ。アップロード/削除可否は canWritePrefixes で
 * UI 上も出し分ける。
 */

import {
  Alert,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconColumns,
  IconDownload,
  IconEye,
  IconFile,
  IconFileTypePdf,
  IconFolder,
  IconFolderOpen,
  IconLayoutGrid,
  IconList,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderGrantsModal } from "@/components/admin/FolderGrantsModal";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { downloadFile } from "@/lib/download";
import { isSystemFileKey } from "@/lib/system-files";

interface StoredFile {
  key: string;
  name: string;
  size: number;
  mime: string;
  mtime: string | null;
}

type ViewMode = "list" | "grid" | "columns";

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

function isPdfFile(f: StoredFile): boolean {
  return f.mime.includes("pdf") || f.name.toLowerCase().endsWith(".pdf");
}

function isImageFile(f: StoredFile): boolean {
  return (
    f.mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)
  );
}

function FileIcon({ file, size = 18 }: { file: StoredFile; size?: number }) {
  if (isPdfFile(file))
    return <IconFileTypePdf color="var(--mantine-color-red-6)" size={size} />;
  if (isImageFile(file))
    return <IconPhoto color="var(--mantine-color-blue-6)" size={size} />;
  return <IconFile color="var(--mantine-color-gray-6)" size={size} />;
}

function keyInPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

/** path 直下のエントリ（サブフォルダ + 直接のファイル）。 */
function childrenOf(files: StoredFile[], path: string) {
  const folders = new Map<string, number>();
  const direct: StoredFile[] = [];
  for (const f of files) {
    let rel: string;
    if (!path) rel = f.key;
    else if (f.key.startsWith(`${path}/`)) rel = f.key.slice(path.length + 1);
    else continue;
    const slash = rel.indexOf("/");
    if (slash === -1) direct.push(f);
    else {
      const name = rel.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }
  return {
    folders: [...folders.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: direct.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const rawHref = (key: string, download = false) =>
  `/api/admin/files/raw?key=${encodeURIComponent(key)}${download ? "&download=1" : ""}`;

export function FileManager() {
  const tr = useTr();
  const fmt = useFormat();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [writePrefixes, setWritePrefixes] = useState<string[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [showSystem, setShowSystem] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [grantsOpen, setGrantsOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/files");
      const json = await res.json();
      setFiles(json.files ?? []);
      setStorageOk(json.storageOk !== false);
      setIsAdmin(json.isAdmin === true);
      setWritePrefixes(json.canWritePrefixes ?? []);
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

  const canWrite = useCallback(
    (key: string) => {
      if (writePrefixes === null) return true; // 管理者
      return writePrefixes.some((p) => keyInPrefix(key, p));
    },
    [writePrefixes],
  );

  /** 表示対象（システムファイルトグル + 検索）。 */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) =>
        (showSystem || !isSystemFileKey(f.key)) &&
        (!q || f.key.toLowerCase().includes(q)),
    );
  }, [files, query, showSystem]);

  /** 隠れているシステムファイル数（トグルの案内用）。 */
  const hiddenSystemCount = useMemo(
    () => (showSystem ? 0 : files.filter((f) => isSystemFileKey(f.key)).length),
    [files, showSystem],
  );

  const searching = query.trim().length > 0;

  /** 検索中はフォルダを無視して全件フラット表示。 */
  const current = useMemo(
    () =>
      searching
        ? {
            folders: [],
            files: [...visible].sort((a, b) => a.key.localeCompare(b.key)),
          }
        : childrenOf(visible, path),
    [visible, path, searching],
  );

  const allFolders = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const segs = f.key.split("/");
      for (let i = 1; i < segs.length; i++) {
        set.add(segs.slice(0, i).join("/"));
      }
    }
    return [...set].sort();
  }, [files]);

  const selectedFile = useMemo(
    () => visible.find((f) => f.key === selectedKey) ?? null,
    [visible, selectedKey],
  );

  const segments = path ? path.split("/") : [];

  function openFolder(next: string) {
    setPath(next);
    setSelectedKey(null);
  }

  async function onUpload(file: File | null | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("prefix", path || "uploads");
      const res = await fetch("/api/admin/files", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      notifications.show({
        title: tr("アップロードしました"),
        message: file.name,
        color: "green",
      });
      await reload();
    } catch (err) {
      notifications.show({
        title: tr("アップロード失敗"),
        message: err instanceof Error ? err.message : tr("不明なエラー"),
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
        title: tr("削除しました"),
        message: file.name,
        color: "green",
      });
      setFiles((prev) => prev.filter((f) => f.key !== file.key));
      if (selectedKey === file.key) setSelectedKey(null);
    } catch (err) {
      notifications.show({
        title: tr("削除失敗"),
        message: err instanceof Error ? err.message : tr("不明なエラー"),
        color: "red",
      });
    }
  }

  function confirmDelete(f: StoredFile) {
    openConfirm({
      title: tr("ファイルの削除"),
      message: `「${f.name}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => onDelete(f),
    });
  }

  /* ---------- サブビュー ---------- */

  const _folderRow = (name: string, count: number) => (
    <UnstyledButton
      key={`d:${name}`}
      onClick={() => openFolder(path ? `${path}/${name}` : name)}
      px="sm"
      py={6}
      style={{
        display: "block",
        width: "100%",
        borderRadius: "var(--mantine-radius-sm)",
      }}
    >
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconFolder color="var(--mantine-color-blue-5)" size={18} />
          <Text size="sm">{name}</Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Text c="dimmed" size="xs">
            {count}件
          </Text>
          <IconChevronRight color="var(--mantine-color-gray-5)" size={14} />
        </Group>
      </Group>
    </UnstyledButton>
  );

  const listView = (
    <Table highlightOnHover striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("名前")}</Table.Th>
          <Table.Th style={{ width: 100, textAlign: "right" }}>
            {tr("サイズ")}
          </Table.Th>
          <Table.Th style={{ width: 150 }}>{tr("更新日時")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {current.folders.map((d) => (
          <Table.Tr
            key={`d:${d.name}`}
            onClick={() => openFolder(path ? `${path}/${d.name}` : d.name)}
            style={{ cursor: "pointer" }}
          >
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <IconFolder color="var(--mantine-color-blue-5)" size={18} />
                <Text size="sm">{d.name}</Text>
              </Group>
            </Table.Td>
            <Table.Td align="right">
              <Text c="dimmed" size="sm">
                {d.count}件
              </Text>
            </Table.Td>
            <Table.Td>
              <Text c="dimmed" size="sm">
                —
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
        {current.files.map((f) => (
          <Table.Tr
            bg={
              f.key === selectedKey
                ? "var(--mantine-color-blue-light)"
                : undefined
            }
            key={f.key}
            onClick={() => setSelectedKey(f.key)}
            style={{ cursor: "pointer" }}
          >
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <FileIcon file={f} />
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {f.name}
                  </Text>
                  {searching && (
                    <Text c="dimmed" ff="mono" size="xs" truncate>
                      {f.key}
                    </Text>
                  )}
                </Stack>
                {isSystemFileKey(f.key) && (
                  <Badge color="gray" size="xs" variant="light">
                    {tr("システム")}
                  </Badge>
                )}
              </Group>
            </Table.Td>
            <Table.Td align="right">
              <Text className="tabular-nums" size="sm">
                {formatBytes(f.size)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text c="dimmed" size="sm">
                {fmt.dateTime(f.mtime)}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  const gridView = (
    <SimpleGrid cols={{ base: 3, sm: 4, lg: 6 }} spacing="sm">
      {current.folders.map((d) => (
        <UnstyledButton
          key={`d:${d.name}`}
          onClick={() => openFolder(path ? `${path}/${d.name}` : d.name)}
        >
          <Stack align="center" gap={4} p="sm">
            <IconFolder color="var(--mantine-color-blue-5)" size={44} />
            <Text lineClamp={2} size="xs" ta="center">
              {d.name}
            </Text>
            <Text c="dimmed" size="xs">
              {d.count}件
            </Text>
          </Stack>
        </UnstyledButton>
      ))}
      {current.files.map((f) => (
        <UnstyledButton key={f.key} onClick={() => setSelectedKey(f.key)}>
          <Paper
            bg={
              f.key === selectedKey
                ? "var(--mantine-color-blue-light)"
                : undefined
            }
            p="sm"
            radius="md"
          >
            <Stack align="center" gap={4}>
              {isImageFile(f) ? (
                // biome-ignore lint/performance/noImgElement: 認証付き /api/admin/files/raw のプレビュー — next/image の最適化プロキシはセッション cookie を持たず 403 になる
                <img
                  alt={f.name}
                  height={44}
                  src={rawHref(f.key)}
                  style={{ objectFit: "contain", maxWidth: "100%" }}
                />
              ) : (
                <FileIcon file={f} size={44} />
              )}
              <Text lineClamp={2} size="xs" ta="center">
                {f.name}
              </Text>
            </Stack>
          </Paper>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );

  const columnLevels = useMemo(() => {
    if (searching) return [];
    const levels: { path: string; active: string | null }[] = [];
    for (let i = 0; i <= segments.length; i++) {
      levels.push({
        path: segments.slice(0, i).join("/"),
        active: i < segments.length ? segments[i] : null,
      });
    }
    return levels;
  }, [segments, searching]);

  const columnsView = (
    <ScrollArea type="auto">
      <Group align="stretch" gap={0} wrap="nowrap">
        {columnLevels.map((lvl) => {
          const c = childrenOf(visible, lvl.path);
          return (
            <Box
              key={lvl.path || "(root)"}
              style={{
                width: 230,
                minWidth: 230,
                borderRight: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <ScrollArea h={420} type="auto">
                <Stack gap={2} p={4}>
                  {c.folders.map((d) => {
                    const full = lvl.path ? `${lvl.path}/${d.name}` : d.name;
                    const active = lvl.active === d.name;
                    return (
                      <UnstyledButton
                        bg={
                          active ? "var(--mantine-color-blue-light)" : undefined
                        }
                        key={`d:${d.name}`}
                        onClick={() => openFolder(full)}
                        px="xs"
                        py={4}
                        style={{
                          borderRadius: "var(--mantine-radius-sm)",
                        }}
                      >
                        <Group gap={6} justify="space-between" wrap="nowrap">
                          <Group gap={6} wrap="nowrap">
                            <IconFolder
                              color="var(--mantine-color-blue-5)"
                              size={15}
                            />
                            <Text size="sm" truncate>
                              {d.name}
                            </Text>
                          </Group>
                          <IconChevronRight
                            color="var(--mantine-color-gray-5)"
                            size={13}
                          />
                        </Group>
                      </UnstyledButton>
                    );
                  })}
                  {c.files.map((f) => (
                    <UnstyledButton
                      bg={
                        f.key === selectedKey
                          ? "var(--mantine-color-blue-light)"
                          : undefined
                      }
                      key={f.key}
                      onClick={() => setSelectedKey(f.key)}
                      px="xs"
                      py={4}
                      style={{ borderRadius: "var(--mantine-radius-sm)" }}
                    >
                      <Group gap={6} wrap="nowrap">
                        <FileIcon file={f} size={15} />
                        <Text size="sm" truncate>
                          {f.name}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                  {c.folders.length === 0 && c.files.length === 0 && (
                    <Text c="dimmed" p="xs" size="xs">
                      {tr("空のフォルダ")}
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Box>
          );
        })}
      </Group>
    </ScrollArea>
  );

  const previewPane = selectedFile && (
    <Paper p="md" radius="md" style={{ width: 320, minWidth: 320 }} withBorder>
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <FileIcon file={selectedFile} />
          <Text fw={600} size="sm" style={{ wordBreak: "break-all" }}>
            {selectedFile.name}
          </Text>
        </Group>

        {isImageFile(selectedFile) ? (
          // biome-ignore lint/performance/noImgElement: 認証付き /api/admin/files/raw のプレビュー — next/image の最適化プロキシはセッション cookie を持たず 403 になる
          <img
            alt={selectedFile.name}
            src={rawHref(selectedFile.key)}
            style={{
              maxWidth: "100%",
              maxHeight: 260,
              objectFit: "contain",
              borderRadius: "var(--mantine-radius-sm)",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          />
        ) : isPdfFile(selectedFile) ? (
          <iframe
            // view=FitH / zoom=page-width — 既定の「ページ全体」だと狭い枠内で
            // ページが縮み、周囲の灰色余白ばかりになるため幅フィットに固定。
            src={`${rawHref(selectedFile.key)}#toolbar=0&navpanes=0&view=FitH&zoom=page-width`}
            style={{
              width: "100%",
              height: 320,
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "var(--mantine-radius-sm)",
            }}
            title={selectedFile.name}
          />
        ) : (
          <Group justify="center" py="lg">
            <FileIcon file={selectedFile} size={56} />
          </Group>
        )}

        <Stack gap={4}>
          <Group gap="xs" justify="space-between">
            <Text c="dimmed" size="xs">
              {tr("パス")}
            </Text>
            <Text
              ff="mono"
              size="xs"
              style={{ wordBreak: "break-all", textAlign: "right" }}
            >
              {selectedFile.key}
            </Text>
          </Group>
          <Group gap="xs" justify="space-between">
            <Text c="dimmed" size="xs">
              {tr("サイズ")}
            </Text>
            <Text className="tabular-nums" size="xs">
              {formatBytes(selectedFile.size)}
            </Text>
          </Group>
          <Group gap="xs" justify="space-between">
            <Text c="dimmed" size="xs">
              {tr("更新日時")}
            </Text>
            <Text size="xs">{fmt.dateTime(selectedFile.mtime)}</Text>
          </Group>
          <Group gap="xs" justify="space-between">
            <Text c="dimmed" size="xs">
              {tr("種類")}
            </Text>
            <Text size="xs">{selectedFile.mime || tr("不明")}</Text>
          </Group>
          {isSystemFileKey(selectedFile.key) && (
            <Badge color="gray" variant="light">
              {tr("システムファイル")}
            </Badge>
          )}
        </Stack>

        <Group gap={4} wrap="wrap">
          <GhostButton
            external
            href={rawHref(selectedFile.key)}
            leftSection={<IconEye size={14} />}
            size="xs"
          >
            {tr("開く")}
          </GhostButton>
          <GhostButton
            leftSection={<IconDownload size={14} />}
            onClick={() =>
              void downloadFile(
                rawHref(selectedFile.key, true),
                selectedFile.name,
              )
            }
            size="xs"
          >
            {tr("ダウンロード")}
          </GhostButton>
          {canWrite(selectedFile.key) && (
            <GhostButton
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => confirmDelete(selectedFile)}
              size="xs"
            >
              削除
            </GhostButton>
          )}
        </Group>
      </Stack>
    </Paper>
  );

  const empty =
    current.folders.length === 0 && current.files.length === 0 && !loading;

  return (
    <ListShell
      action={
        <Group gap="xs">
          {isAdmin && (
            <GhostButton
              leftSection={<IconUsersGroup size={16} />}
              onClick={() => setGrantsOpen(true)}
            >
              {tr("フォルダ権限")}
            </GhostButton>
          )}
          <GhostButton
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={reload}
          >
            更新
          </GhostButton>
          {canWrite(`${path || "uploads"}/x`) && (
            <PrimaryButton
              leftSection={<IconUpload size={16} />}
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {tr("アップロード")}
            </PrimaryButton>
          )}
          <input
            hidden
            onChange={(e) => onUpload(e.target.files?.[0])}
            ref={inputRef}
            type="file"
          />
        </Group>
      }
      breadcrumbs={[tr("システム"), tr("ファイル管理")]}
      filters={
        <Group gap="sm" wrap="nowrap">
          <SegmentedControl
            data={[
              {
                value: "list",
                label: (
                  <Tooltip label={tr("リスト")} withinPortal>
                    <IconList size={16} style={{ display: "block" }} />
                  </Tooltip>
                ),
              },
              {
                value: "grid",
                label: (
                  <Tooltip label={tr("アイコン")} withinPortal>
                    <IconLayoutGrid size={16} style={{ display: "block" }} />
                  </Tooltip>
                ),
              },
              {
                value: "columns",
                label: (
                  <Tooltip label={tr("カラム")} withinPortal>
                    <IconColumns size={16} style={{ display: "block" }} />
                  </Tooltip>
                ),
              },
            ]}
            onChange={(v) => setView(v as ViewMode)}
            size="xs"
            value={view}
          />
          <Tooltip
            label={tr(
              tr(
                tr(
                  "「.DS_Store」「*.tmp」など、OS・ツールが自動生成した残骸ファイルを表示します",
                ),
              ),
            )}
            withinPortal
          >
            <Switch
              checked={showSystem}
              label={
                hiddenSystemCount > 0
                  ? `システムファイル (${hiddenSystemCount})`
                  : tr("システムファイル")
              }
              onChange={(e) => {
                setShowSystem(e.currentTarget.checked);
                setSelectedKey(null);
              }}
              size="sm"
            />
          </Tooltip>
        </Group>
      }
      onReset={() => {
        setQuery("");
        setPath("");
        setSelectedKey(null);
      }}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={tr("ファイル名・パスで検索（全フォルダ横断）")}
          value={query}
        />
      }
      title={tr("ファイル管理")}
    >
      {!storageOk && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          mb="sm"
          variant="light"
        >
          {tr(
            tr(
              tr(
                "ストレージ（SeaweedFS）に接続できません。SEAWEED_FILER_URL\n          とコンテナの稼働状況をご確認ください。",
              ),
            ),
          )}
        </Alert>
      )}

      {/* パンくず（フォルダ階層） */}
      {!searching && (
        <Group gap={4} mb="sm" wrap="wrap">
          <GhostButton
            leftSection={<IconFolderOpen size={14} />}
            onClick={() => openFolder("")}
            size="xs"
          >
            {tr("すべて")}
          </GhostButton>
          {segments.map((seg, i) => (
            <Group
              gap={4}
              key={segments.slice(0, i + 1).join("/")}
              wrap="nowrap"
            >
              <IconChevronRight color="var(--mantine-color-gray-5)" size={13} />
              <GhostButton
                onClick={() => openFolder(segments.slice(0, i + 1).join("/"))}
                size="xs"
              >
                {seg}
              </GhostButton>
            </Group>
          ))}
        </Group>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            {tr("読み込み中…")}
          </Text>
        </Group>
      ) : (
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            {empty ? (
              <Stack align="center" gap="xs" py="xl">
                <IconFile color="var(--mantine-color-gray-5)" size={28} />
                <Text c="dimmed" size="sm">
                  {storageOk
                    ? files.length === 0
                      ? tr("閲覧できるファイルはありません")
                      : tr("このフォルダにファイルはありません")
                    : tr("ストレージに接続できません")}
                </Text>
              </Stack>
            ) : view === "grid" ? (
              gridView
            ) : view === "columns" && !searching ? (
              columnsView
            ) : (
              listView
            )}
          </Box>
          {previewPane}
        </Group>
      )}

      {isAdmin && (
        <FolderGrantsModal
          defaultPrefix={path || "uploads"}
          folders={allFolders}
          onClose={() => setGrantsOpen(false)}
          opened={grantsOpen}
        />
      )}
    </ListShell>
  );
}
