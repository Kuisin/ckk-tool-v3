"use client";

/**
 * OrderAcceptanceIntakeTable — 注文請書 取込状況一覧 (SA04, design.md §8.1)。
 *
 * 監視フォルダ（FOLDER）/ 優先取込（UPLOAD）/ 手入力（MANUAL）で作成された
 * 注文請書の取込・承認・展開の進捗を一覧する。
 * Columns: 番号 / 取込元 / ファイル名 / 顧客 / 明細数 / 状態 / エラー / 取込日時。
 *
 * ヘッダー: 「優先取込」FileButton（複数可）+ 手入力新規 +
 * 注文明細一覧（/sales/order-lines）へのリンク。
 *
 * 優先取込は **2 段階**:
 *   1. 選んだファイルを 1 件ずつ POST /api/intake/upload（`defer=1`）—
 *      保存 + 採番だけ。この時点で**全件が一覧に並ぶ**。
 *   2. 採番された番号をまとめて POST /api/intake/queue — ここで抽出が始まる。
 * 先に送った 1 枚だけ抽出が走って残りがまだ一覧に無い、という見え方を
 * 避けるため。抽出自体はサーバー側の待ち行列が同時実行数を守って流すので、
 * ボタンのローディングは 2 段目の受付で解除され、抽出は待たない。
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
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { parseExtractError } from "@/lib/intake-extract-error";
import { statusOptions } from "@/lib/status-map";
import { INTAKE_SOURCE_BADGE, type OrderAcceptanceListRow } from "./model";

/** 抽出失敗の表示（分類済みメッセージ — 旧形式の 1 行もそのまま読める）。 */
function ExtractErrorBadge({
  stored,
  size = "sm",
}: {
  stored: string;
  size?: "xs" | "sm";
}) {
  const tr = useTr();
  const failure = parseExtractError(stored);
  return (
    <Tooltip
      label={[
        failure.summary,
        failure.cause,
        `対処: ${failure.hint}`,
        failure.detail,
      ]
        .filter(Boolean)
        .join("\n")}
      multiline
      w={340}
      withinPortal
    >
      <Badge
        color={failure.retrying ? "orange" : "red"}
        size={size}
        variant="light"
      >
        {failure.retrying ? "再試行中" : tr("抽出失敗")}
      </Badge>
    </Tooltip>
  );
}

const BASE_PATH = "/sales/order-acceptances";
const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

/** アップロード API の応答（保存 + 採番まで — 抽出はまだ積まれていない）。 */
interface UploadResult {
  ok?: boolean;
  /** 採番された注文請書番号（ORD-YYYYMM-NNNNN）。 */
  number?: string;
  status?: string;
  error?: string;
}

/** 抽出キュー API の応答。 */
interface QueueResult {
  ok?: boolean;
  /** 実際に積んだ件数。 */
  queued?: number;
  /** 対象外だった番号（抽出済み・原本なし など）。 */
  skipped?: string[];
  /** 抽出待ちの件数（積んだ分を含む）。 */
  pending?: number;
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
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");
  const [uploading, setUploading] = useState(false);

  // 取込中（抽出待ち・自動再試行の待機中）の行がある間は 30 秒ごとに
  // 自動更新（進捗の可視化）。
  const hasImporting = rows.some(
    (r) =>
      r.status === "IMPORT" &&
      (!r.extractError || parseExtractError(r.extractError).retrying),
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

  /**
   * 優先取込 — まず**選んだファイルを全部**一覧に載せ（保存 + 採番のみ）、
   * それが済んでから採番された番号をまとめて抽出キューへ積む。
   *
   * 1 段目で抽出まで積んでしまうと、1 枚目の抽出が走っている間 2 枚目以降が
   * まだ一覧に無い、という見え方になる。抽出はサーバー側の待ち行列が
   * 同時実行数を守って流すので、**ボタンは 2 段目の受付で戻る** — 抽出の完了は
   * 待たない。進捗は一覧の状態（取込中 → 下書き）で見る。
   */
  const handlePriorityIntake = async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    const nid = `priority-intake-${Date.now()}`;
    notifications.show({
      id: nid,
      autoClose: false,
      color: "blue",
      loading: true,
      message: `${files.length} 件を一覧に追加しています…`,
      title: tr("優先取込"),
      withCloseButton: false,
    });
    // 1 段目: 保存 + 採番だけ（defer=1）。ここでは抽出を積まない。
    const numbers: string[] = [];
    const failures: string[] = [];
    for (const [i, file] of files.entries()) {
      notifications.update({
        id: nid,
        autoClose: false,
        color: "blue",
        loading: true,
        message: `${i + 1} / ${files.length} 件目: ${file.name} を追加中…`,
        title: tr("優先取込"),
        withCloseButton: false,
      });
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("defer", "1");
        const res = await fetch("/api/intake/upload", { method: "POST", body });
        const json = (await res
          .json()
          .catch(() => null)) as UploadResult | null;
        if (res.ok && json?.ok && json.number) {
          numbers.push(json.number);
        } else {
          failures.push(`${file.name}: ${json?.error ?? "取込に失敗しました"}`);
        }
      } catch {
        failures.push(`${file.name}: 通信エラー`);
      }
    }
    // 全件が一覧に並んだ状態を先に見せてから抽出を始める。
    router.refresh();

    // 2 段目: 追加できた分をまとめて抽出キューへ。
    let pending = 0;
    let queueError: string | null = null;
    if (numbers.length > 0) {
      notifications.update({
        id: nid,
        autoClose: false,
        color: "blue",
        loading: true,
        message: `${numbers.length} 件をAI抽出の待ち行列に入れています…`,
        title: tr("優先取込"),
        withCloseButton: false,
      });
      try {
        const res = await fetch("/api/intake/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers }),
        });
        const json = (await res.json().catch(() => null)) as QueueResult | null;
        if (res.ok && json?.ok) {
          pending = json.pending ?? 0;
          if (json.skipped && json.skipped.length > 0) {
            queueError = `抽出を開始できなかった書類: ${json.skipped.join(" ・ ")}`;
          }
        } else {
          queueError = json?.error ?? tr("AI抽出の開始に失敗しました");
        }
      } catch {
        queueError = tr("AI抽出の開始に失敗しました（通信エラー）");
      }
    }

    const problems = [...failures, ...(queueError ? [queueError] : [])];
    notifications.update({
      id: nid,
      autoClose: 8000,
      color: problems.length > 0 ? "orange" : "green",
      loading: false,
      message:
        problems.length > 0
          ? `${numbers.length} 件を一覧に追加しました / ${problems.join(" ・ ")}`
          : `${numbers.length} 件を一覧に追加しました。AI抽出はこのあと順番に実行されます` +
            `${pending > 1 ? `（抽出待ち ${pending} 件）` : ""}`,
      title:
        problems.length > 0 ? "優先取込 受付（一部失敗）" : tr("優先取込 受付"),
      withCloseButton: true,
    });
    // ボタンはここで戻る — 抽出の完了は待たない。
    setUploading(false);
    router.refresh();
  };

  const columns: Column<OrderAcceptanceListRow>[] = [
    {
      key: "number",
      header: tr("番号"),
      sortable: true,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.number}
        </Text>
      ),
    },
    {
      key: "source",
      header: tr("取込元"),
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
      header: tr("ファイル名"),
      hideable: true,
      render: (r) => (
        <Text c={r.sourceFilename ? undefined : "dimmed"} size="sm" truncate>
          {r.sourceFilename ?? "—"}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("顧客"),
      sortable: true,
      sortValue: (r) => r.customerName ?? "",
      render: (r) =>
        r.customerName ? (
          <Text size="sm" truncate>
            {r.customerName}
          </Text>
        ) : (
          <Badge color="orange" size="sm" variant="light">
            {tr("未特定")}
          </Badge>
        ),
    },
    {
      key: "itemCount",
      header: tr("明細数"),
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
      key: "orderDate",
      header: tr("注文日"),
      width: 110,
      sortable: true,
      sortValue: (r) => r.orderDate ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.orderDate ? fmt.date(r.orderDate) : "—"}
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("状態"),
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => (
        <StatusBadge entity="OrderAcceptanceIntake" status={r.status} />
      ),
    },
    {
      key: "extractError",
      header: tr("エラー"),
      width: 90,
      sortValue: (r) => (r.extractError ? 1 : 0),
      render: (r) =>
        r.extractError ? (
          <ExtractErrorBadge stored={r.extractError} />
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "createdAt",
      header: tr("取込日時"),
      width: 140,
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.dateTime(r.createdAt)}
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
              href="/sales/order-lines"
              leftSection={<IconClipboardList size={14} />}
            >
              {tr("注文明細一覧")}
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
                {tr("優先取込")}
              </PrimaryButton>
            )}
          </FileButton>
          <NewButton href={`${BASE_PATH}/new`} label={tr("手入力で新規")} />
        </Group>
      }
      breadcrumbs={[tr("販売"), tr("注文請書")]}
      filters={
        <Select
          clearable
          data={statusOptions("OrderAcceptanceIntake")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder={tr("状態")}
          value={status}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("番号・ファイル名・顧客で検索")}
          value={search}
        />
      }
      title={tr("注文請書")}
    >
      <Stack gap="xs">
        <Group gap="sm">
          <Badge
            color={intakeDirConfigured ? "teal" : "gray"}
            size="sm"
            variant="dot"
          >
            監視フォルダ取込: {intakeDirConfigured ? "有効" : tr("未設定")}
          </Badge>
          <Text c="dimmed" size="xs">
            {tr(
              "優先取込は選んだファイルを先にすべて一覧へ追加し、そのあとAI抽出をまとめて待ち行列に入れます。抽出はバックグラウンドで順に実行します（1件あたり約1〜3分）。取込中の行がある間は30秒ごとに自動更新します。",
            )}
          </Text>
        </Group>
        <DataTable
          columns={columns}
          data={filtered}
          defaultSort={{ key: "number", dir: "desc" }}
          emptyIcon={<IconClipboardCheck size={24} />}
          emptyMessage={tr("注文請書がありません")}
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
                      {tr("顧客未特定")}
                    </Badge>
                  )}
                  <Text c="dimmed" size="xs" truncate>
                    {r.sourceFilename ?? tr("（手入力）")}
                  </Text>
                  <Group gap="md" mt={2}>
                    <Badge color={def.color} size="xs" variant="light">
                      {def.label}
                    </Badge>
                    <Text c="dimmed" size="xs">
                      明細 {r.itemCount} 件
                    </Text>
                    {r.orderDate && (
                      <Text c="dimmed" size="xs">
                        注文日 {fmt.date(r.orderDate)}
                      </Text>
                    )}
                    {r.extractError && (
                      <ExtractErrorBadge size="xs" stored={r.extractError} />
                    )}
                  </Group>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <StatusBadge
                    entity="OrderAcceptanceIntake"
                    status={r.status}
                  />
                  <Text c="dimmed" size="xs">
                    {fmt.dateTime(r.createdAt)}
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
