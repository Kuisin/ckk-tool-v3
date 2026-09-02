"use client";

/**
 * OrderIntakeFolderPanel — 注文書取込（SY0C）のクライアント本体。
 *
 * やることは 3 つだけ:
 *   1. 複数ファイルを取込フォルダへ投入（1 件ずつ POST /api/intake/folder）
 *   2. 取込待ち / 失敗 / 取込済 の中身を、**なった注文請書と並べて**見る
 *   3. 今すぐスキャン / 失敗の再取込
 *
 * 投入は「置くだけ」— 採番も抽出もサーバーのポーラーがやる。だから投入直後の
 * 画面は「取込待ち・未採番」に並ぶだけで、番号はまだ付かない。採番されると
 * ファイル名に番号が焼き込まれる（lib/intake.ts）ので、この画面はそれを読んで
 * 注文請書（SA04）へリンクする — ファイル名の羅列で終わらせない。
 * 取込待ちがある間は 30 秒ごとに自動更新する。
 */

import {
  Alert,
  Anchor,
  Badge,
  Code,
  FileButton,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  retryFailedIntakeFile,
  scanIntakeFolderNow,
} from "@/app/(dashboard)/settings/order-intake/actions";
import type { IntakeDocRef } from "@/app/(dashboard)/settings/order-intake/data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { parseIntakeFileNumber } from "@/lib/intake-core";
import { parseExtractError } from "@/lib/intake-extract-error";
import type {
  IntakeFolderEntry,
  IntakeFolderStatus,
} from "@/lib/intake-folder";

const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const ACCEPTANCES_PATH = "/sales/order-acceptances";

interface UploadResponse {
  ok?: boolean;
  name?: string;
  error?: string;
}

/** 表示用に整えた 1 行（ファイル + それがなった注文請書）。 */
interface FolderRow extends IntakeFolderEntry {
  /** 番号を除いた元のファイル名（`.processing` も外す）。 */
  label: string;
  /** 焼き込まれていた注文請書番号（未採番なら null）。 */
  number: string | null;
  /** 番号から引けた注文請書（消された書類なら null）。 */
  doc: IntakeDocRef | null;
  /** 抽出中（`.processing` でクレーム済み）。 */
  processing: boolean;
}

/** バイト数を人が読める形に（一覧の右端に出すだけなので概算で十分）。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** フォルダの 1 件 → 表示用の行（番号を切り出して書類と突き合わせる）。 */
function toRow(
  entry: IntakeFolderEntry,
  docs: Record<string, IntakeDocRef>,
): FolderRow {
  const processing = entry.name.endsWith(".processing");
  const base = processing
    ? entry.name.slice(0, -".processing".length)
    : entry.name;
  const parsed = parseIntakeFileNumber(base);
  return {
    ...entry,
    label: parsed?.rest ?? base,
    number: parsed?.number ?? null,
    doc: parsed ? (docs[parsed.number] ?? null) : null,
    processing,
  };
}

export function OrderIntakeFolderPanel({
  status,
  docs,
}: {
  status: IntakeFolderStatus;
  /** ORD 番号 → 注文請書（サーバーで解決済み）。 */
  docs: Record<string, IntakeDocRef>;
}) {
  const tr = useTranslations();
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
      message: tr("settings.orderIntakeFolderPanel.puttingFilesIntoTheFolder", {
        count: files.length,
      }),
      title: tr("common.orderIntake"),
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
        message: tr("settings.orderIntakeFolderPanel.fileNOfTotal", {
          n: i + 1,
          total: files.length,
          name: file.name,
        }),
        title: tr("common.orderIntake"),
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
          failures.push(
            `${file.name}: ${
              json?.error ?? tr("settings.orderIntakeFolderPanel.failedToPutIn")
            }`,
          );
      } catch {
        failures.push(
          `${file.name}: ${tr("settings.orderIntakeFolderPanel.communicationError")}`,
        );
      }
    }

    notifications.update({
      id: nid,
      autoClose: 8000,
      color: failures.length > 0 ? "orange" : "green",
      loading: false,
      message:
        failures.length > 0
          ? tr("settings.orderIntakeFolderPanel.putInCountFailures", {
              count: okCount,
              failures: failures.join(
                tr("settings.orderIntakeFolderPanel.listSeparator"),
              ),
            })
          : tr("settings.orderIntakeFolderPanel.putCountFilesInTheQueue", {
              count: okCount,
            }),
      title:
        failures.length > 0
          ? tr("settings.orderIntakeFolderPanel.putInPartialFailure")
          : tr("settings.orderIntake.queued"),
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
              title: tr("settings.orderIntake.scanningStarted"),
              message: tr("settings.orderIntake.importsRunInTurnYouCan"),
              color: "green",
            }
          : { title: tr("common.error2"), message: result.error, color: "red" },
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
              title: tr("settings.orderIntake.putBackInTheIntakeQueue"),
              message: tr(
                "settings.orderIntake.theNumberedOrderAcceptanceStaysOnly",
              ),
              color: "green",
            }
          : { title: tr("common.error2"), message: result.error, color: "red" },
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
            ? tr("settings.orderIntake.cannotReadTheIntakeFolder")
            : tr("settings.orderIntake.theIntakeFolderIsNotConfigured")
        }
      >
        <Stack gap="xs">
          <Text size="sm">
            {status.error ??
              tr("settings.orderIntake.thisEnvironmentHasNoWatchedFolder")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("settings.orderIntake.evenWithoutTheFolderYouCan")}
          </Text>
          <Group gap="xs">
            <SecondaryButton
              href={ACCEPTANCES_PATH}
              leftSection={<IconClipboardList size={14} />}
            >
              {tr("settings.orderIntake.toTheOrderAcceptance")}
            </SecondaryButton>
          </Group>
        </Stack>
      </Alert>
    );
  }

  const pendingRows = [
    ...status.processing.map((e) => toRow(e, docs)),
    ...status.pending.map((e) => toRow(e, docs)),
  ];
  const failedRows = status.failed.map((e) => toRow(e, docs));
  const processedRows = status.processed.map((e) => toRow(e, docs));

  return (
    <Stack gap="md">
      {/* ── 投入 + 現況 ─────────────────────────────────────────────────── */}
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Group gap="xs" justify="space-between">
            <Title order={4}>
              {tr("settings.orderIntake.putItInTheFolder")}
            </Title>
            <Group gap="xs">
              <Badge color="blue" variant="light">
                {tr("settings.orderIntake.awaitingImport")} {pendingRows.length}
              </Badge>
              <Badge color="red" variant="light">
                {tr("common.failure")} {status.failedTotal}
              </Badge>
              <Badge color="green" variant="light">
                {tr("settings.orderIntake.imported")} {status.processedTotal}
              </Badge>
            </Group>
          </Group>
          <Text c="dimmed" size="sm">
            {tr("settings.orderIntake.selectingTheOrdersYouReceivedPdf")}
          </Text>
          <Group gap="xs">
            <FileButton accept={UPLOAD_ACCEPT} multiple onChange={handleImport}>
              {(props) => (
                <PrimaryButton
                  leftSection={<IconUpload size={14} />}
                  loading={uploading}
                  {...props}
                >
                  {tr("common.chooseAFile")}
                </PrimaryButton>
              )}
            </FileButton>
            <SecondaryButton
              leftSection={<IconRefresh size={14} />}
              loading={isPending}
              onClick={scanNow}
            >
              {tr("settings.orderIntake.scanNow")}
            </SecondaryButton>
            <SecondaryButton
              href={ACCEPTANCES_PATH}
              leftSection={<IconClipboardList size={14} />}
            >
              {tr("settings.orderIntake.toTheOrderAcceptances")}
            </SecondaryButton>
          </Group>
          <Group gap="xs">
            <Text c="dimmed" size="xs">
              {tr("settings.orderIntake.intakeFolder")}
            </Text>
            <Code>{status.dir}</Code>
            <Text c="dimmed" size="xs">
              {tr("settings.orderIntakeFolderPanel.autoScanEverySSeconds", {
                seconds: Math.round(status.pollIntervalMs / 1000),
              })}
            </Text>
          </Group>
        </Stack>
      </Paper>

      {/* ── 取込待ち ───────────────────────────────────────────────────── */}
      <FolderSection
        color="blue"
        description={tr("settings.orderIntake.itIsImportedAtTheNext")}
        emptyMessage={tr("settings.orderIntake.thereAreNoFilesAwaitingImport")}
        rows={pendingRows}
        title={tr("settings.orderIntake.awaitingImport")}
      />

      {/* ── 失敗 ───────────────────────────────────────────────────────── */}
      <FolderSection
        color="red"
        description={tr(
          "settings.orderIntake.filesWhoseExtractionFailedOnceThe",
        )}
        emptyMessage={tr("settings.orderIntake.thereAreNoFailedFiles")}
        onRetry={retry}
        retryDisabled={isPending}
        rows={failedRows}
        title={tr("common.failure")}
        total={status.failedTotal}
      />

      {/* ── 取込済 ─────────────────────────────────────────────────────── */}
      <FolderSection
        color="green"
        description={tr(
          "settings.orderIntake.alreadyImportedAsAnOrderAcceptance",
        )}
        emptyMessage={tr("settings.orderIntake.thereAreNoImportedFiles")}
        rows={processedRows}
        title={tr("settings.orderIntake.imported")}
        total={status.processedTotal}
      />
    </Stack>
  );
}

/** 「どの注文請書になったか」列。未採番・削除済みも同じ幅で見せる。 */
function DocumentCell({ row }: { row: FolderRow }) {
  const tr = useTranslations();
  if (!row.number) {
    return (
      <Group gap={6} wrap="nowrap">
        <Text c="dimmed" size="xs">
          {tr("common.notNumbered")}
        </Text>
        {row.processing && (
          <Badge color="blue" size="xs" variant="light">
            {tr("settings.orderIntake.extracting")}
          </Badge>
        )}
      </Group>
    );
  }
  const failure = row.doc?.extractError
    ? parseExtractError(row.doc.extractError)
    : null;
  return (
    <Stack gap={2}>
      <Group gap={6} wrap="nowrap">
        <Anchor
          component={Link}
          ff="mono"
          href={`${ACCEPTANCES_PATH}/${row.number}`}
          size="sm"
        >
          {row.number}
        </Anchor>
        {row.doc ? (
          <StatusBadge entity="OrderAcceptanceIntake" status={row.doc.status} />
        ) : (
          <Badge color="gray" size="sm" variant="light">
            {tr("settings.orderIntake.noDocument")}
          </Badge>
        )}
        {row.processing && (
          <Badge color="blue" size="xs" variant="light">
            {tr("settings.orderIntake.extracting")}
          </Badge>
        )}
      </Group>
      {row.doc && (
        <Group gap={6} wrap="nowrap">
          <Text c={row.doc.customerName ? "dimmed" : "orange"} size="xs">
            {row.doc.customerName ?? tr("common.customerNotIdentified")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("settings.orderIntakeFolderPanel.lineItemsCountLines", {
              count: row.doc.itemCount,
            })}
          </Text>
          {failure && (
            <Tooltip
              label={[
                failure.summary,
                failure.cause,
                tr("settings.orderIntakeFolderPanel.remedyHint", {
                  hint: failure.hint,
                }),
              ]
                .filter(Boolean)
                .join("\n")}
              multiline
              w={320}
              withinPortal
            >
              <Badge
                color={failure.retrying ? "orange" : "red"}
                size="xs"
                variant="light"
              >
                {failure.retrying
                  ? tr("settings.orderIntakeFolderPanel.retrying")
                  : tr("common.extractionFailed")}
              </Badge>
            </Tooltip>
          )}
        </Group>
      )}
    </Stack>
  );
}

/** フォルダ 1 つ分の一覧（待ち / 失敗 / 取込済で共用）。 */
function FolderSection({
  title,
  description,
  color,
  rows,
  emptyMessage,
  total,
  onRetry,
  retryDisabled,
}: {
  title: string;
  description: string;
  color: string;
  rows: FolderRow[];
  emptyMessage: string;
  /** 切り詰め前の全件数（一覧は最大 50 件）。 */
  total?: number;
  onRetry?: (name: string) => void;
  retryDisabled?: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const shown = rows.length;
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
            <Table.ScrollContainer minWidth={640}>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 260 }}>
                      {tr("common.orderAcceptance")}
                    </Table.Th>
                    <Table.Th>{tr("common.file")}</Table.Th>
                    <Table.Th style={{ width: 90, textAlign: "right" }}>
                      {tr("common.size")}
                    </Table.Th>
                    <Table.Th style={{ width: 150 }}>
                      {tr("settings.orderIntakeFolderPanel.updatedColumn")}
                    </Table.Th>
                    {onRetry && <Table.Th style={{ width: 120 }} />}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => (
                    <Table.Tr key={row.name}>
                      <Table.Td>
                        <DocumentCell row={row} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" title={row.name}>
                          {row.label}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text c="dimmed" size="xs">
                          {formatBytes(row.sizeBytes)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" size="xs">
                          {fmt.dateTime(row.modifiedAt)}
                        </Text>
                      </Table.Td>
                      {onRetry && (
                        <Table.Td>
                          <GhostButton
                            disabled={retryDisabled}
                            leftSection={<IconArrowBackUp size={14} />}
                            onClick={() => onRetry(row.name)}
                          >
                            {tr("settings.orderIntake.reImport")}
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
                {tr("settings.orderIntakeFolderPanel.showingNewestOfTotal", {
                  shown,
                  all,
                })}
              </Text>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
