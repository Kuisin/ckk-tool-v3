"use client";

/**
 * OrderAcceptanceIntakeTable — 受注請書 取込状況一覧 (SA03, design.md §8.1)。
 *
 * 監視フォルダ（FOLDER）/ 優先取込（UPLOAD）/ 手入力（MANUAL）で作成された
 * 受注請書の取込・承認・展開の進捗を一覧する。
 * Columns: 番号 / 取込元 / ファイル名 / 顧客 / 明細数 / 状態 / エラー / 取込日時。
 *
 * ヘッダー: 「優先取込」FileButton（複数可 — 逐次 POST /api/intake/upload、
 * 抽出は 1 件 約30〜60秒。進捗は persistent notification を更新）+
 * 手入力新規 + 注文請書一覧（/production/sales-orders）へのリンク。
 * 取込中（IMPORT・未エラー）の行がある間は 30 秒ごとに自動更新する。
 */

import {
  Badge,
  FileButton,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconClipboardCheck,
  IconClipboardList,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDateTime } from "@/lib/format";
import { INTAKE_SOURCE_BADGE, type OrderAcceptanceListRow } from "./model";

const BASE_PATH = "/sales/order-acceptances";
const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

/** アップロード API の応答。 */
interface UploadResult {
  ok?: boolean;
  number?: string;
  status?: string;
  error?: string;
}

export function OrderAcceptanceIntakeTable({
  rows,
  intakeDirConfigured,
}: {
  rows: OrderAcceptanceListRow[];
  /** INTAKE_DIR（監視フォルダ）が設定されているか（サーバーから渡す）。 */
  intakeDirConfigured: boolean;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");
  const [uploading, setUploading] = useState(false);

  // 取込中（抽出待ち）の行がある間は 30 秒ごとに自動更新（進捗の可視化）。
  const hasImporting = rows.some(
    (r) => r.status === "IMPORT" && !r.extractError,
  );
  useEffect(() => {
    if (!hasImporting) return;
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [hasImporting, router]);

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.number.includes(search) ||
      (r.sourceFilename ?? "").includes(search) ||
      (r.customerName ?? "").includes(search);
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesStatus;
  });

  /** 優先取込 — 選択ファイルを 1 件ずつ抽出（GPU は 1 件ずつ処理）。 */
  const handlePriorityIntake = async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    const nid = `priority-intake-${Date.now()}`;
    notifications.show({
      id: nid,
      autoClose: false,
      color: "blue",
      loading: true,
      message: `${files.length} 件を順番に抽出します（1件あたり約30〜60秒）`,
      title: "優先取込を開始しました",
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
        message: `${i + 1} / ${files.length} 件目: ${file.name} を抽出中…`,
        title: "優先取込 処理中",
        withCloseButton: false,
      });
      try {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/intake/upload", { method: "POST", body });
        const json = (await res
          .json()
          .catch(() => null)) as UploadResult | null;
        if (res.ok && json?.ok && json.status === "DRAFT") {
          okCount += 1;
        } else {
          failures.push(`${file.name}: ${json?.error ?? "取込に失敗しました"}`);
        }
      } catch {
        failures.push(`${file.name}: 通信エラー`);
      }
      // 1 件ごとに一覧を更新（IMPORT → DRAFT の進捗を見せる）。
      router.refresh();
    }
    notifications.update({
      id: nid,
      autoClose: 8000,
      color: failures.length > 0 ? "orange" : "green",
      loading: false,
      message:
        failures.length > 0
          ? `${okCount} 件成功 / 失敗: ${failures.join(" ・ ")}`
          : `${okCount} 件を取り込みました`,
      title:
        failures.length > 0 ? "優先取込 完了（一部失敗）" : "優先取込 完了",
      withCloseButton: true,
    });
    setUploading(false);
    router.refresh();
  };

  const columns: Column<OrderAcceptanceListRow>[] = [
    {
      key: "number",
      header: "番号",
      sortable: true,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.number}
        </Text>
      ),
    },
    {
      key: "source",
      header: "取込元",
      width: 110,
      sortValue: (r) => r.source,
      render: (r) => {
        const def = INTAKE_SOURCE_BADGE[r.source];
        return (
          <Badge color={def.color} size="sm" variant="light">
            {def.label}
          </Badge>
        );
      },
    },
    {
      key: "sourceFilename",
      header: "ファイル名",
      hideable: true,
      render: (r) => (
        <Text c={r.sourceFilename ? undefined : "dimmed"} size="sm" truncate>
          {r.sourceFilename ?? "—"}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      sortValue: (r) => r.customerName ?? "",
      render: (r) =>
        r.customerName ? (
          <Text size="sm" truncate>
            {r.customerName}
          </Text>
        ) : (
          <Badge color="orange" size="sm" variant="light">
            未特定
          </Badge>
        ),
    },
    {
      key: "itemCount",
      header: "明細数",
      align: "right",
      width: 80,
      sortValue: (r) => r.itemCount,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.itemCount}
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => (
        <StatusBadge entity="OrderAcceptanceIntake" status={r.status} />
      ),
    },
    {
      key: "extractError",
      header: "エラー",
      width: 90,
      sortValue: (r) => (r.extractError ? 1 : 0),
      render: (r) =>
        r.extractError ? (
          <Tooltip label={r.extractError} multiline w={320} withinPortal>
            <Badge color="red" size="sm" variant="light">
              抽出失敗
            </Badge>
          </Tooltip>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "createdAt",
      header: "取込日時",
      width: 140,
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDateTime(r.createdAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs" wrap="nowrap">
          {!isMobile && (
            <SecondaryButton
              href="/production/sales-orders"
              leftSection={<IconClipboardList size={14} />}
            >
              注文請書一覧
            </SecondaryButton>
          )}
          <FileButton
            accept={UPLOAD_ACCEPT}
            multiple
            onChange={handlePriorityIntake}
          >
            {(props) => (
              <PrimaryButton
                leftSection={<IconUpload size={14} />}
                loading={uploading}
                {...props}
              >
                優先取込
              </PrimaryButton>
            )}
          </FileButton>
          <NewButton href={`${BASE_PATH}/new`} label="手入力で新規" />
        </Group>
      }
      breadcrumbs={["販売", "受注請書"]}
      filters={
        <Select
          clearable
          data={statusOptions("OrderAcceptanceIntake")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder="状態"
          value={status}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="番号・ファイル名・顧客で検索"
          value={search}
        />
      }
      title="受注請書 取込状況"
    >
      <Stack gap="xs">
        <Group gap="sm">
          <Badge
            color={intakeDirConfigured ? "teal" : "gray"}
            size="sm"
            variant="dot"
          >
            監視フォルダ取込: {intakeDirConfigured ? "有効" : "未設定"}
          </Badge>
          <Text c="dimmed" size="xs">
            抽出は1件あたり約30〜60秒。取込中の行がある間は30秒ごとに自動更新します。
          </Text>
        </Group>
        <DataTable
          columns={columns}
          data={filtered}
          defaultSort={{ key: "number", dir: "desc" }}
          emptyIcon={<IconClipboardCheck size={24} />}
          emptyMessage="取込された受注請書がありません"
          getRowId={(r) => r.number}
          onRowClick={(r) => router.push(`${BASE_PATH}/${r.number}`)}
          renderCard={(r) => {
            const def = INTAKE_SOURCE_BADGE[r.source];
            return (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text c="dimmed" ff="mono" size="xs">
                    {r.number}
                  </Text>
                  {r.customerName ? (
                    <Text fw={600} size="sm" truncate>
                      {r.customerName}
                    </Text>
                  ) : (
                    <Badge color="orange" size="xs" variant="light">
                      顧客未特定
                    </Badge>
                  )}
                  <Text c="dimmed" size="xs" truncate>
                    {r.sourceFilename ?? "（手入力）"}
                  </Text>
                  <Group gap="md" mt={2}>
                    <Badge color={def.color} size="xs" variant="light">
                      {def.label}
                    </Badge>
                    <Text c="dimmed" size="xs">
                      明細 {r.itemCount} 件
                    </Text>
                    {r.extractError && (
                      <Badge color="red" size="xs" variant="light">
                        抽出失敗
                      </Badge>
                    )}
                  </Group>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <StatusBadge
                    entity="OrderAcceptanceIntake"
                    status={r.status}
                  />
                  <Text c="dimmed" size="xs">
                    {formatDateTime(r.createdAt)}
                  </Text>
                </Stack>
              </Group>
            );
          }}
          urlState
        />
      </Stack>
    </ListShell>
  );
}
