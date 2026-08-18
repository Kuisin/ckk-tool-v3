"use client";

/**
 * OrderIntakeFolderPanel — 注文書取込（SY0C）のクライアント本体。
 *
 * やることは 3 つだけ:
 *   1. 複数ファイルを取込フォルダへ投入（1 件ずつ POST /api/intake/folder）
 *   2. 待ち / 処理中 / 取込済 / 失敗 の中身を見る
 *   3. 今すぐスキャン / 失敗の再取込
 *
 * 投入は「置くだけ」— 採番も抽出もサーバーのポーラーがやる。だから投入直後の
 * 画面は「取込待ち」に並ぶだけで、受注請書の番号はまだ付かない（付いたら
 * SA04 受注請書の一覧に出る）。待ちがある間は 30 秒ごとに自動更新する。
 */

import {
  Alert,
  Badge,
  Code,
  FileButton,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconClipboardList,
  IconInfoCircle,
  IconRefresh,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  retryFailedIntakeFile,
  scanIntakeFolderNow,
} from "@/app/(dashboard)/settings/order-intake/actions";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import type {
  IntakeFolderEntry,
  IntakeFolderStatus,
} from "@/lib/intake-folder";

const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

interface UploadResponse {
  ok?: boolean;
  name?: string;
  error?: string;
}

/** バイト数を人が読める形に（一覧の右端に出すだけなので概算で十分）。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderIntakeFolderPanel({
  status,
}: {
  status: IntakeFolderStatus;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 待ち・処理中があるうちは 30 秒ごとに更新（ポーラーは既定 60 秒間隔）。
  const inFlight = status.pending.length + status.processing.length;
  useEffect(() => {
    if (inFlight === 0) return;
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  /**
   * 投入 — 1 ファイルずつ送る。まとめて 1 リクエストにすると proxy の
   * 24MB 上限（next.config.ts）に当たるため（超過分は黙って切り捨てられる）。
   */
  const handleImport = async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    const nid = `intake-folder-${files.length}-${files[0]?.name ?? ""}`;
    notifications.show({
      id: nid,
      autoClose: false,
      color: "blue",
      loading: true,
      message: `${files.length} 件をフォルダへ投入しています…`,
      title: "注文書取込",
      withCloseButton: false,
    });

    let okCount = 0;
    const failures: string[] = [];
    for (const [i, file] of files.entries()) {
      notifications.update({
        id: nid,
        autoClose: false,
        color: "blue",
        loading: true,
        message: `${i + 1} / ${files.length} 件目: ${file.name}`,
        title: "注文書取込",
        withCloseButton: false,
      });
      try {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/intake/folder", {
          method: "POST",
          body,
        });
        const json = (await res
          .json()
          .catch(() => null)) as UploadResponse | null;
        if (res.ok && json?.ok) okCount += 1;
        else
          failures.push(`${file.name}: ${json?.error ?? "投入に失敗しました"}`);
      } catch {
        failures.push(`${file.name}: 通信エラー`);
      }
    }

    notifications.update({
      id: nid,
      autoClose: 8000,
      color: failures.length > 0 ? "orange" : "green",
      loading: false,
      message:
        failures.length > 0
          ? `${okCount} 件を投入 / 失敗: ${failures.join(" ・ ")}`
          : `${okCount} 件を取込待ちに入れました。取込はこのあと順番に実行されます`,
      title: failures.length > 0 ? "投入（一部失敗）" : "投入しました",
      withCloseButton: true,
    });
    setUploading(false);
    router.refresh();
  };

  const scanNow = () => {
    startTransition(async () => {
      const result = await scanIntakeFolderNow();
      notifications.show(
        result.ok
          ? {
              title: "スキャンを開始しました",
              message:
                "取込は 1 件ずつ実行されます。結果は受注請書の一覧で確認できます",
              color: "green",
            }
          : { title: "エラー", message: result.error, color: "red" },
      );
      router.refresh();
    });
  };

  const retry = (name: string) => {
    startTransition(async () => {
      const result = await retryFailedIntakeFile(name);
      notifications.show(
        result.ok
          ? {
              title: "取込待ちに戻しました",
              message: result.data.name,
              color: "green",
            }
          : { title: "エラー", message: result.error, color: "red" },
      );
      router.refresh();
    });
  };

  // ── 未設定・未マウント ────────────────────────────────────────────────────
  if (!status.configured || !status.readable) {
    return (
      <Alert
        color={status.configured ? "red" : "gray"}
        icon={<IconAlertTriangle size={18} />}
        title={
          status.configured
            ? "取込フォルダを読めません"
            : "取込フォルダが未設定です"
        }
      >
        <Stack gap="xs">
          <Text size="sm">
            {status.error ??
              "この環境には監視フォルダ（環境変数 INTAKE_DIR）が設定されていません。設定すると、フォルダに置かれた注文書が自動で受注請書として取り込まれます。"}
          </Text>
          <Text c="dimmed" size="xs">
            フォルダを使わない場合でも、受注請書（SA04）の「優先取込」から 1
            件ずつ取り込めます。
          </Text>
          <Group gap="xs">
            <SecondaryButton
              href="/sales/order-acceptances"
              leftSection={<IconClipboardList size={14} />}
            >
              受注請書へ
            </SecondaryButton>
          </Group>
        </Stack>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* ── 投入 ───────────────────────────────────────────────────────── */}
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Title order={4}>フォルダへ投入</Title>
          <Text c="dimmed" size="sm">
            受け取った注文書（PDF / PNG / JPG / WEBP、1 件 20MB
            まで）をまとめて選ぶと、取込フォルダにそのまま置かれます。共有フォルダへ
            直接コピーしたときと同じ経路で、順番に受注請書へ取り込まれます。
          </Text>
          <Group gap="xs">
            <FileButton accept={UPLOAD_ACCEPT} multiple onChange={handleImport}>
              {(props) => (
                <PrimaryButton
                  leftSection={<IconUpload size={14} />}
                  loading={uploading}
                  {...props}
                >
                  ファイルを選ぶ
                </PrimaryButton>
              )}
            </FileButton>
            <SecondaryButton
              leftSection={<IconRefresh size={14} />}
              loading={isPending}
              onClick={scanNow}
            >
              今すぐスキャン
            </SecondaryButton>
            <SecondaryButton
              href="/sales/order-acceptances"
              leftSection={<IconClipboardList size={14} />}
            >
              受注請書へ
            </SecondaryButton>
          </Group>
          <Group gap="xs">
            <Text c="dimmed" size="xs">
              取込フォルダ:
            </Text>
            <Code>{status.dir}</Code>
            <Text c="dimmed" size="xs">
              自動スキャン {Math.round(status.pollIntervalMs / 1000)} 秒ごと
            </Text>
          </Group>
        </Stack>
      </Paper>

      {/* ── 取込待ち ───────────────────────────────────────────────────── */}
      <FolderSection
        color="blue"
        description="次のスキャンで取り込まれます。処理中の 1 件は抽出（約 30〜60 秒）が終わるまでここに残ります。"
        emptyMessage="取込待ちのファイルはありません"
        entries={[...status.pending, ...status.processing]}
        title="取込待ち"
      />

      {/* ── 失敗 ───────────────────────────────────────────────────────── */}
      <FolderSection
        color="red"
        description="抽出に失敗したファイル。原因を直したら取込待ちへ戻せます（番号は採り直しになります）。"
        emptyMessage="失敗したファイルはありません"
        entries={status.failed}
        onRetry={retry}
        retryDisabled={isPending}
        title="失敗"
        total={status.failedTotal}
      />

      {/* ── 取込済 ─────────────────────────────────────────────────────── */}
      <FolderSection
        color="green"
        description="受注請書として取り込み済み。中身は受注請書の一覧で確認できます。"
        emptyMessage="取込済のファイルはありません"
        entries={status.processed}
        title="取込済"
        total={status.processedTotal}
      />
    </Stack>
  );
}

/** フォルダ 1 つ分の一覧（待ち / 失敗 / 取込済で共用）。 */
function FolderSection({
  title,
  description,
  color,
  entries,
  emptyMessage,
  total,
  onRetry,
  retryDisabled,
}: {
  title: string;
  description: string;
  color: string;
  entries: IntakeFolderEntry[];
  emptyMessage: string;
  /** 切り詰め前の全件数（一覧は最大 50 件）。 */
  total?: number;
  onRetry?: (name: string) => void;
  retryDisabled?: boolean;
}) {
  const shown = entries.length;
  const all = total ?? shown;
  return (
    <Paper p="md" radius="md" shadow="xs">
      <Stack gap="sm">
        <Group gap="xs">
          <Title order={4}>{title}</Title>
          <Badge color={color} variant="light">
            {all}
          </Badge>
        </Group>
        <Text c="dimmed" size="sm">
          {description}
        </Text>
        {shown === 0 ? (
          <EmptyState
            icon={<IconInfoCircle size={20} />}
            message={emptyMessage}
          />
        ) : (
          <>
            <Table.ScrollContainer minWidth={520}>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ファイル名</Table.Th>
                    <Table.Th style={{ width: 110, textAlign: "right" }}>
                      サイズ
                    </Table.Th>
                    <Table.Th style={{ width: 160 }}>更新</Table.Th>
                    {onRetry && <Table.Th style={{ width: 130 }} />}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.map((e) => (
                    <Table.Tr key={e.name}>
                      <Table.Td>
                        <Text size="sm">{e.name}</Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text c="dimmed" size="xs">
                          {formatBytes(e.sizeBytes)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" size="xs">
                          {formatDateTime(e.modifiedAt)}
                        </Text>
                      </Table.Td>
                      {onRetry && (
                        <Table.Td>
                          <GhostButton
                            disabled={retryDisabled}
                            leftSection={<IconArrowBackUp size={14} />}
                            onClick={() => onRetry(e.name)}
                          >
                            再取込
                          </GhostButton>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {all > shown && (
              <Text c="dimmed" size="xs">
                新しい {shown} 件を表示（全 {all} 件）
              </Text>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
