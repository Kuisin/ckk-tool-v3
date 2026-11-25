"use client";

/**
 * CompanySyncPanel — 他社の価格表（相手方）との突き合わせ（価格表 詳細）。
 *
 * 価格表は発行会社ごとに別々に持つ。同じ顧客 × 品目（× 工具）の価格表を
 * 別の会社も持っているとき、中身が同じか（「〇〇社と同じ」/「〇〇社と差分あり」）
 * を出し、違えば差分の表と「〇〇社の内容で同期」を出す。比較は
 * company-sync.ts の pure 関数（id・番号・日時・会社は比べない）。
 *
 * 同期は通常の保存（updatePriceEntry）を通るので、独自値があれば承認を通る。
 */

import {
  Anchor,
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsExchange, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { syncPriceEntryFromCounterpart } from "@/app/(dashboard)/sales/price-lists/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { docNo } from "@/lib/doc-number";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { notifyPriceEntryApproval } from "./approval-notice";
import {
  type CounterpartStatus,
  counterpartStatuses,
  type DiscountContent,
  type PriceContentDiff,
  type TierContent,
} from "./company-sync";
import type { PriceListEntry } from "./model";

const BASE_PATH = "/sales/price-lists";

export function CompanySyncPanel({
  entry,
  counterparts,
  canSync,
}: {
  entry: PriceListEntry;
  /** 相手方（同じ顧客 × 品目 × 工具・別の発行会社）— サーバーが読んで渡す。 */
  counterparts: PriceListEntry[];
  /** 価格表の更新権限があるか（無ければ同期ボタンを出さない）。 */
  canSync: boolean;
}) {
  const tr = useTranslations();
  const statuses = counterpartStatuses(entry, [entry, ...counterparts]);
  if (statuses.length === 0) return null;
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <div>
          <Title order={5}>
            {tr("sales.priceListCompanySync.sectionTitle")}
          </Title>
          <Text c="dimmed" size="xs">
            {tr("sales.priceListCompanySync.sectionDescription")}
          </Text>
        </div>
        {statuses.map((s) => (
          <CounterpartRow
            canSync={canSync}
            entry={entry}
            key={s.entryId}
            status={s}
          />
        ))}
      </Stack>
    </Paper>
  );
}

/** 「〇〇社と同じ / 差分あり」のバッジ（一覧と詳細で同じ見た目）。 */
export function CompanySyncBadge({
  same,
  company,
}: {
  same: boolean;
  company: string;
}) {
  const tr = useTranslations();
  return (
    <Badge color={same ? "green" : "orange"} variant="light">
      {same
        ? tr("sales.priceListCompanySync.sameAs", { company })
        : tr("sales.priceListCompanySync.differsFrom", { company })}
    </Badge>
  );
}

function CounterpartRow({
  entry,
  status,
  canSync,
}: {
  entry: PriceListEntry;
  status: CounterpartStatus;
  canSync: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const company = status.ownCompanyCode;

  const sync = () =>
    openConfirm({
      title: tr("sales.priceListCompanySync.syncFrom", { company }),
      message: tr("sales.priceListCompanySync.syncConfirmMessage", {
        company,
        number: docNo(status.entryId),
      }),
      confirmLabel: tr("sales.priceListCompanySync.syncFrom", { company }),
      onConfirm: () =>
        startTransition(async () => {
          const result = await syncPriceEntryFromCounterpart({
            entryNumber: entry.entryId,
            counterpartEntryNumber: status.entryId,
          });
          if (result.ok) {
            notifications.show({
              title: tr("sales.priceListCompanySync.synced"),
              message: tr("sales.priceListCompanySync.syncedMessage", {
                company,
              }),
              color: "green",
            });
            notifyPriceEntryApproval(result.data, tr);
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        }),
    });

  return (
    <Stack gap="xs">
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Group gap="sm" wrap="wrap">
          <CompanySyncBadge company={company} same={status.same} />
          <Anchor href={`${BASE_PATH}/${status.entryId}`} size="sm">
            {status.ownCompanyName !== company
              ? `${company} ${status.ownCompanyName} · `
              : `${company} · `}
            {docNo(status.entryId)}
          </Anchor>
        </Group>
        {!status.same && (
          <Group gap="xs">
            <GhostButton onClick={() => setOpen((v) => !v)}>
              {open
                ? tr("sales.priceListCompanySync.hideDiff")
                : tr("sales.priceListCompanySync.showDiff")}
            </GhostButton>
            {canSync && (
              <SecondaryButton
                leftSection={<IconArrowsExchange size={14} />}
                loading={isPending}
                onClick={sync}
              >
                {tr("sales.priceListCompanySync.syncFrom", { company })}
              </SecondaryButton>
            )}
          </Group>
        )}
        {status.same && (
          <IconCheck color="var(--mantine-color-green-6)" size={16} />
        )}
      </Group>
      {open && !status.same && (
        <DiffTable company={company} diffs={status.diffs} />
      )}
    </Stack>
  );
}

function DiffTable({
  diffs,
  company,
}: {
  diffs: PriceContentDiff[];
  company: string;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const date = (v: string | null) => (v ? fmt.date(v) : tr("common.noEndDate"));
  const tier = (t: TierContent | null) =>
    t
      ? `${t.maxQuantity == null ? `${t.minQuantity}〜` : `${t.minQuantity}〜${t.maxQuantity}`} ×${t.multiplier.toFixed(2)}${t.priceOverride != null ? ` (${formatMoney(t.priceOverride)})` : ""}`
      : tr("sales.priceListCompanySync.notRegistered");
  const discount = (d: DiscountContent | null) =>
    d
      ? `${d.label} ${d.discountType === "RATE" ? `${d.value}%` : formatMoney(d.value)} · ${d.maxQuantity == null ? `${d.minQuantity}〜` : `${d.minQuantity}〜${d.maxQuantity}`} · ${date(d.validFrom)}〜${d.validUntil ? date(d.validUntil) : ""}${d.isActive ? "" : ` · ${tr("common.disabled")}`}`
      : tr("sales.priceListCompanySync.notRegistered");
  const value = (
    field: Extract<PriceContentDiff, { kind: "variantField" }>["field"],
    v: number | string | boolean | null,
  ) => {
    if (field === "baseUnitPrice") return formatMoney(Number(v));
    if (field === "isActive")
      return v ? tr("common.enabled") : tr("common.disabled");
    return date(v as string | null);
  };
  const fieldLabel: Record<
    Extract<PriceContentDiff, { kind: "variantField" }>["field"],
    string
  > = {
    baseUnitPrice: tr("sales.priceLists.baseUnitPrice"),
    validFrom: tr("common.validFrom"),
    validUntil: tr("common.validUntil"),
    isActive: tr("common.status"),
  };
  const rowOf = (d: PriceContentDiff) => {
    if (d.kind === "variant") {
      const yesNo = (b: boolean) =>
        b
          ? tr("sales.priceListCompanySync.registered")
          : tr("sales.priceListCompanySync.notRegistered");
      return {
        label: tr("common.orderType"),
        here: yesNo(d.here),
        there: yesNo(d.there),
      };
    }
    if (d.kind === "variantField") {
      return {
        label: fieldLabel[d.field],
        here: value(d.field, d.here),
        there: value(d.field, d.there),
      };
    }
    if (d.kind === "tier") {
      return {
        label: tr("sales.priceListCompanySync.tierRow", { n: d.index + 1 }),
        here: tier(d.here),
        there: tier(d.there),
      };
    }
    return {
      label: tr("sales.priceListCompanySync.discountRow", { n: d.index + 1 }),
      here: discount(d.here),
      there: discount(d.there),
    };
  };
  const rows = diffs.map(rowOf);
  return (
    <Table.ScrollContainer minWidth={520}>
      <Table fz="sm" withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{tr("common.orderType")}</Table.Th>
            <Table.Th>{tr("sales.priceListCompanySync.field")}</Table.Th>
            <Table.Th>
              {tr("sales.priceListCompanySync.thisPriceList")}
            </Table.Th>
            <Table.Th>{company}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {diffs.map((d, i) => (
            <Table.Tr key={`${d.orderType}-${d.kind}-${i}`}>
              <Table.Td>
                {ORDER_TYPE_LABEL[d.orderType] ?? d.orderType}
              </Table.Td>
              <Table.Td>{rows[i].label}</Table.Td>
              <Table.Td style={{ fontVariantNumeric: "tabular-nums" }}>
                {rows[i].here}
              </Table.Td>
              <Table.Td style={{ fontVariantNumeric: "tabular-nums" }}>
                {rows[i].there}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
