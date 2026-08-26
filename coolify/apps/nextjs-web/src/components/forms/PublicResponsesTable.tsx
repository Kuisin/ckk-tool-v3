"use client";

import { Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ResponseRow } from "@/lib/forms";

/**
 * 回答一覧（共有された人向け）。作成者用の一覧と違い、集計・共有・履歴への
 * 導線は持たない — 見えるのは回答そのものだけ。
 */
export function PublicResponsesTable({
  code,
  responses,
  respondentShown,
}: {
  code: string;
  responses: ResponseRow[];
  respondentShown: boolean;
}) {
  const router = useRouter();
  const fmt = useFormat();

  return (
    <DataTable
      columns={[
        {
          key: "recordNo",
          header: "No.",
          width: 80,
          align: "right",
          sortValue: (r) => r.recordNo,
          render: (r) => r.recordNo,
        },
        // 回答者を出すのは respondentVisibility=SHOWN のときだけ。サーバが
        // null にしているので、ここは列ごと落とす。
        ...(respondentShown
          ? [
              {
                key: "respondent",
                header: "回答者",
                width: 160,
                render: (r: ResponseRow) => r.respondent ?? "—",
              },
            ]
          : []),
        {
          key: "status",
          header: "状態",
          width: 110,
          render: (r) => (
            <StatusBadge entity="FormResponse" status={r.status} />
          ),
        },
        {
          key: "summary",
          header: "内容",
          render: (r) => (
            <Text lineClamp={1} size="sm">
              {r.summary || "—"}
            </Text>
          ),
        },
        {
          key: "submittedAt",
          header: "提出日時",
          width: 150,
          render: (r) => (r.submittedAt ? fmt.dateTime(r.submittedAt) : "—"),
        },
      ]}
      data={responses}
      emptyMessage="見られる回答がありません"
      getRowId={(r) => r.responseNumber}
      onRowClick={(r) =>
        router.push(`/f/${code}/${encodeURIComponent(r.responseNumber)}`)
      }
      renderCard={(r) => (
        <div>
          <Text fw={600} size="sm">
            No.{r.recordNo}
            {respondentShown && r.respondent ? ` / ${r.respondent}` : ""}
          </Text>
          <Text c="dimmed" lineClamp={2} size="xs">
            {r.summary || "—"}
          </Text>
        </div>
      )}
    />
  );
}
