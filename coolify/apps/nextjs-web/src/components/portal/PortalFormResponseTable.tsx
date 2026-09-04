"use client";

/**
 * フォーム回答の一覧。行を押すとその回答の中身へ。
 *
 * 出せるのは番号と提出日だけ（回答本文は共有条件に当たる項目しか手元に無い）。
 * だからこそ**行が開ける**ことが要る —— 番号だけの表からは、どれが自分の
 * 探しているものか判らない。
 */

import { Group, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
  PortalList,
  type PortalListColumn,
} from "@/components/portal/PortalList";
import type { PortalFormResponseRow } from "@/lib/portal-forms";

export function PortalFormResponseTable({
  code,
  rows,
}: {
  code: string;
  rows: PortalFormResponseRow[];
}) {
  const tr = useTranslations();

  const columns: PortalListColumn<PortalFormResponseRow>[] = [
    {
      key: "responseNumber",
      header: tr("common.responseNumber"),
      render: (r) => (
        <Text ff="monospace" size="sm">
          {r.responseNumber}
        </Text>
      ),
    },
    {
      key: "submittedOn",
      header: tr("common.submittedOn"),
      render: (r) => <Text size="sm">{r.submittedOn ?? "—"}</Text>,
    },
  ];

  return (
    <PortalList
      columns={columns}
      empty={tr("portal.forms.thereAreNoResponsesToShow")}
      href={(r) =>
        `/portal/forms/${encodeURIComponent(code)}/${encodeURIComponent(r.responseNumber)}`
      }
      mobile={(r) => (
        <Group justify="space-between" wrap="nowrap">
          <Text ff="monospace" fw={600} size="sm">
            {r.responseNumber}
          </Text>
          <Text c="dimmed" size="xs">
            {r.submittedOn ?? "—"}
          </Text>
        </Group>
      )}
      rowKey={(r) => r.responseNumber}
      rows={rows}
    />
  );
}
