"use client";

/**
 * StepInspectionApprovalPanel.tsx — 検査承認工程（is_approval_step）で、
 * 指示書全体の検査記録を承認する。**現場のタブレット向けに作り直したもの**で、
 * nextjs-web の InspectionApprovalPanel の移植ではない。
 *
 * web は「一覧を読んで判断する」画面なので、記録・承認の日時と担当者を全件
 * 並べてよい。共有端末は違う — 立ったまま、手袋で、腕の長さから見る。
 * そこで次の 3 点を web と変えている:
 *
 *   1. **やることだけを出す。** 既定で並ぶのは「いま自分が承認できる記録」だけ。
 *      承認済み・不合格・自分が承認者でないものは畳んで、必要なときだけ開く。
 *      web は全件を常に出す（監査の視点で読む画面だから）。
 *   2. **残り件数を最初に言う。** 「承認待ち 2 件」→ 押すたびに減り、
 *      0 になれば「すべて承認しました」。終わったかどうかを数えさせない。
 *   3. **1 件 = 1 枚の大きなカードと、幅いっぱいの大きなボタン。** 日時や
 *      担当者は畳んだ側に置く — 押す人には要らない情報で、指の的を小さくする
 *      だけなので。
 *
 * 承認できるかどうかはサーバーが記録ごとに解いて渡す（canApprove）。
 * 画面は判断しない — 判定が 2 か所に増えると必ず食い違う。
 */

import {
  Alert,
  Badge,
  Button,
  Collapse,
  Drawer,
  Group,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClipboardCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import type { ApprovableInspectionRecord } from "@/lib/inspection-approval";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

type Props = {
  stepId: string;
  records: ApprovableInspectionRecord[];
  /** 作業中 / 一時停止中のみ true（それ以外は読み取り専用）。 */
  canApprove: boolean;
};

export function StepInspectionApprovalPanel({
  stepId,
  records,
  canApprove,
}: Props) {
  const router = useRouter();
  const { m, locale } = useI18n();
  const t = m.steps.approval;
  const statusTable = m.steps.inspection.status as Record<string, string>;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  /**
   * 中身を見ている記録。**承認は「見てから押す」もの**なので、記入済みの
   * 検査表を全画面で開き、そのまま承認できるようにする。カードの中に表を
   * 畳んで入れると、10 インチの画面では 1 件で埋まってしまう。
   */
  const [viewing, setViewing] = useState<ApprovableInspectionRecord | null>(
    null,
  );

  // いま押せるものと、そうでないもの。画面に出す順序がこの 2 つで決まる。
  const todo = canApprove ? records.filter((r) => r.canApprove) : [];
  const others = records.filter((r) => !todo.includes(r));

  const fmtAt = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const approve = async (recordId: string) => {
    setBusyId(recordId);
    setError(null);
    const res = await callStepAction(stepId, {
      action: "INSPECTION_APPROVE",
      recordId,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(translateError(m, res));
      router.refresh(); // 競合（他の人が先に承認した等）は最新を出し直す
      return;
    }
    router.refresh();
  };

  /** 押せない理由（畳んだ側でだけ出す）。 */
  const reasonOf = (r: ApprovableInspectionRecord): string | null => {
    if (r.approvedAt) return null;
    if (r.status !== "PASS") return t.onlyPass;
    if (!r.canApprove) return t.notApprover;
    return null;
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Group gap="sm" justify="space-between" wrap="wrap">
          <Text fw={600} size="lg">
            {t.title}
          </Text>
          {/* 残り件数を最初に言う — 終わったかどうかを数えさせない。 */}
          {records.length > 0 &&
            (todo.length > 0 ? (
              <Badge color="orange" size="xl" variant="light">
                {fillMessage(t.remaining, { n: todo.length })}
              </Badge>
            ) : (
              <Badge
                color="teal"
                leftSection={<IconCheck size={18} />}
                size="xl"
                variant="light"
              >
                {t.allDone}
              </Badge>
            ))}
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}

        {records.length === 0 && <Text c="dimmed">{t.empty}</Text>}

        {/* いま押せるものだけ。1 件 = 1 枚 + 幅いっぱいの大きなボタン。 */}
        {todo.map((r) => (
          <Paper key={r.id} p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Text fw={600} size="xl">
                {r.stepName}
              </Text>
              <Text c="dimmed">{r.templateName}</Text>
              <Button
                fullWidth
                leftSection={<IconClipboardCheck size={24} />}
                onClick={() => setViewing(r)}
                size="lg"
                variant="default"
              >
                {t.viewSheet}
              </Button>
              <Button
                color="green"
                fullWidth
                leftSection={<IconCheck size={24} />}
                loading={busyId === r.id}
                onClick={() => approve(r.id)}
                size="xl"
              >
                {t.approve}
              </Button>
            </Stack>
          </Paper>
        ))}

        {/* 承認済み・対象外は畳む。読みたい人だけが開く。 */}
        {others.length > 0 && (
          <Stack gap="xs">
            <Button
              fullWidth
              justify="space-between"
              onClick={() => setOthersOpen((v) => !v)}
              rightSection={
                othersOpen ? (
                  <IconChevronUp size={20} />
                ) : (
                  <IconChevronDown size={20} />
                )
              }
              size="md"
              variant="subtle"
            >
              {othersOpen
                ? t.othersHide
                : fillMessage(t.othersToggle, { n: others.length })}
            </Button>
            <Collapse expanded={othersOpen}>
              <Stack gap="xs">
                {others.map((r) => {
                  const reason = reasonOf(r);
                  return (
                    <Paper key={r.id} p="sm" radius="sm" withBorder>
                      <Stack gap={4}>
                        <Group gap="sm" wrap="wrap">
                          <Text fw={600}>
                            {fillMessage(t.sheetOf, {
                              step: r.stepName,
                              sheet: r.templateName,
                            })}
                          </Text>
                          <Badge
                            color={
                              r.status === "APPROVED"
                                ? "teal"
                                : r.status === "PASS"
                                  ? "green"
                                  : "red"
                            }
                            variant="light"
                          >
                            {statusTable[r.status] ?? r.status}
                          </Badge>
                        </Group>
                        {r.recordedAt && (
                          <Text c="dimmed" size="sm">
                            {fillMessage(t.recordedBy, {
                              at: fmtAt(r.recordedAt),
                              by: r.recordedByName ?? "",
                            })}
                          </Text>
                        )}
                        {r.approvedAt && (
                          <Text c="dimmed" size="sm">
                            {fillMessage(t.approvedMeta, {
                              at: fmtAt(r.approvedAt),
                              by: r.approvedByName ?? "",
                            })}
                          </Text>
                        )}
                        {reason && (
                          <Text c="dimmed" size="sm">
                            {reason}
                          </Text>
                        )}
                        <Button
                          leftSection={<IconClipboardCheck size={18} />}
                          onClick={() => setViewing(r)}
                          size="sm"
                          variant="subtle"
                        >
                          {t.viewSheet}
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Collapse>
          </Stack>
        )}
      </Stack>

      {/* 記入済みの検査表（読むだけ）+ そのまま承認。全画面にするのは、
          10 インチのタブレットで表を枠付きのダイアログに入れると本文が
          数十 px しか残らないため（design.md §20.2 の考え方）。 */}
      <Drawer
        onClose={() => setViewing(null)}
        opened={viewing != null}
        position="right"
        size="100%"
        title={
          viewing
            ? fillMessage(t.sheetOf, {
                step: viewing.stepName,
                sheet: viewing.templateName,
              })
            : t.sheetTitle
        }
      >
        {viewing && (
          <Stack gap="md">
            {viewing.recordedAt && (
              <Text c="dimmed">
                {fillMessage(t.recordedBy, {
                  at: fmtAt(viewing.recordedAt),
                  by: viewing.recordedByName ?? "",
                })}
              </Text>
            )}
            {viewing.items.length === 0 ? (
              <Text c="dimmed">{t.noItems}</Text>
            ) : (
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t.item}</Table.Th>
                    <Table.Th>{t.value}</Table.Th>
                    <Table.Th w={110}>{t.verdict}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {viewing.items.map((it) => (
                    <Table.Tr key={`${viewing.id}:${it.itemName}`}>
                      <Table.Td>{it.itemName}</Table.Td>
                      <Table.Td>{it.valueLabel ?? "—"}</Table.Td>
                      <Table.Td>
                        {it.isPass == null ? (
                          "—"
                        ) : (
                          <Badge
                            color={it.isPass ? "green" : "red"}
                            size="lg"
                            variant="light"
                          >
                            {it.isPass
                              ? m.steps.inspection.pass
                              : m.steps.inspection.fail}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Group grow>
              <Button
                onClick={() => setViewing(null)}
                size="lg"
                variant="default"
              >
                {t.close}
              </Button>
              {canApprove && viewing.canApprove && (
                <Button
                  color="green"
                  leftSection={<IconCheck size={24} />}
                  loading={busyId === viewing.id}
                  onClick={async () => {
                    const id = viewing.id;
                    setViewing(null);
                    await approve(id);
                  }}
                  size="lg"
                >
                  {t.approve}
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Drawer>
    </Paper>
  );
}
