"use client";

/**
 * DesignRequestLinks — 「この書類に紐づく設計依頼」の逆リンク一覧。
 *
 * 見積書詳細（関連タブ）/ 注文明細詳細（設計タブ）/ 製品詳細（関連タブ）で
 * 同じ形を出す。設計依頼は任意の側枝なので、無いときは起票への導線だけを
 * 残して静かに畳む。
 */

import { Anchor, Group, Stack, Text } from "@mantine/core";
import { IconRuler2 } from "@tabler/icons-react";
import Link from "next/link";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTr } from "@/hooks/useTr";
import type { DesignRequestLink } from "./model";

const BASE_PATH = "/sales/design-requests";

export function DesignRequestLinks({
  links,
  createHref,
  createDisabledReason,
}: {
  links: DesignRequestLink[];
  /** 起票リンク（`/sales/design-requests/new?...`）。省略すると起票導線を出さない。 */
  createHref?: string;
  /** 起票できない理由（あると起票ボタンの代わりに文言を出す）。 */
  createDisabledReason?: string;
}) {
  const tr = useTr();
  const fmt = useFormat();

  return (
    <Stack gap="sm">
      {links.length > 0 ? (
        <Stack gap="xs">
          {links.map((l) => (
            <Group gap="sm" key={l.requestNumber} wrap="nowrap">
              <Anchor
                component={Link}
                href={`${BASE_PATH}/${encodeURIComponent(l.requestNumber)}`}
                size="sm"
              >
                <DocNumber c="blue">{l.requestNumber}</DocNumber>
              </Anchor>
              <StatusBadge entity="DesignRequest" status={l.status} />
              {l.assigneeName && (
                <Text c="dimmed" size="xs">
                  {l.assigneeName}
                </Text>
              )}
              {l.description && (
                <Text c="dimmed" size="xs" truncate>
                  {l.description}
                </Text>
              )}
              <Text c="dimmed" className="tabular-nums" ml="auto" size="xs">
                {fmt.date(l.updatedAt)}
              </Text>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text c="dimmed" size="sm">
          {tr("—（設計依頼はありません）")}
        </Text>
      )}

      {createDisabledReason ? (
        <Text c="dimmed" size="xs">
          {createDisabledReason}
        </Text>
      ) : createHref ? (
        <Group>
          <SecondaryButton
            href={createHref}
            leftSection={<IconRuler2 size={14} />}
          >
            {tr("設計依頼を起票")}
          </SecondaryButton>
        </Group>
      ) : null}
    </Stack>
  );
}
