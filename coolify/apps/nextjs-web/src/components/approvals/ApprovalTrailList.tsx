"use client";

/**
 * ApprovalTrailList — 正規化された承認記録の一覧（新しい順）。
 *
 * 段の名称は依頼時点のスナップショット由来なので、あとからフロー定義を
 * 変えても当時の呼び名のまま残る。ALL 段は「(2/3)」の進捗を添える。
 *
 * 4 つの書類詳細（注文請書 / 指示書 / 素材発注書 / 購買依頼）で共用する。
 */

import { Badge, Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";

/** 承認記録 1 件（lib/approvals fetchApprovalTrail の records と同形）。 */
export interface ApprovalTrailRecordView {
  approver: string;
  /** 代理承認の場合の原承認者名。 */
  delegateFor: string | null;
  action: string; // APPROVED | REJECTED
  comment: string | null;
  actedAt: string;
}

/** 承認依頼 1 件（段単位）+ 記録（lib/approvals ApprovalTrailEntry と同形）。 */
export interface ApprovalTrailView {
  stepNo: number;
  stepLabel: string;
  status: string; // PENDING | APPROVED | REJECTED
  mode: "ANY" | "ALL";
  requestedAt: string;
  /** ALL 段の進捗（ANY 段は null）。 */
  progress: { approved: number; required: number } | null;
  records: ApprovalTrailRecordView[];
}

/** trail 内の総記録数（表示要否の判定用）。 */
export function countTrailRecords(trail: ApprovalTrailView[]): number {
  return trail.reduce((n, t) => n + t.records.length, 0);
}

export function ApprovalTrailList({ trail }: { trail: ApprovalTrailView[] }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const trailActionLabel: Record<string, string> = {
    APPROVED: tr("common.approve"),
    REJECTED: tr("common.reject"),
  };
  const records = trail
    .flatMap((req) =>
      req.records.map((rec, i) => ({
        key: `${req.stepNo}-${rec.actedAt}-${i}`,
        stepLabel: req.stepLabel,
        progress: req.progress,
        ...rec,
      })),
    )
    .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1));
  if (records.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text c="dimmed" fw={600} size="xs">
        {tr("approvals.approvalTrailList.approvalRecord")}
      </Text>
      {records.map((r) => (
        <Group gap="sm" key={r.key} wrap="nowrap">
          <Badge color="gray" size="sm" variant="outline">
            {r.stepLabel}
            {r.progress
              ? ` (${r.progress.approved}/${r.progress.required})`
              : ""}
          </Badge>
          <Badge
            color={r.action === "APPROVED" ? "green" : "red"}
            size="sm"
            variant="light"
          >
            {trailActionLabel[r.action] ?? r.action}
          </Badge>
          <Text size="xs">
            {r.approver}
            {r.delegateFor && (
              <Text c="dimmed" component="span" size="xs">
                （代理: {r.delegateFor}）
              </Text>
            )}
          </Text>
          <Text c="dimmed" className="tabular-nums" size="xs">
            {fmt.dateTime(r.actedAt)}
          </Text>
          {r.comment && (
            <Text c="dimmed" size="xs" truncate>
              {r.comment}
            </Text>
          )}
        </Group>
      ))}
    </Stack>
  );
}
