"use client";

/**
 * BpDetail.tsx — 取引先 詳細 (MS21, design.md §8.2 / §13.1).
 *
 * タブ: 概要（付与ロールごとの情報・担当者）/ 支店一覧 / 見積・受注履歴 / 履歴。
 * ロールが付いていない情報は表示しない（付け外しは編集フォーム）。
 */

import {
  Badge,
  Box,
  Checkbox,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBuildingStore,
  IconCircleMinus,
  IconFileText,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";
import type { BpDetail as BpDetailData } from "@/app/(dashboard)/master/_shared/bp-data";
import { BP_BASE_PATH } from "@/app/(dashboard)/master/_shared/bp-paths";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { BpBaseSummary } from "@/components/master/bp/BpBaseSummary";
import {
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { BpRoleBadges } from "@/components/master/bp/BpRoleBadges";
import { ContactsTable } from "@/components/master/bp/ContactsTable";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  BP_ROLE_COLOR,
  invoiceMethodLabel,
  taxTypeLabel,
  vendorTypeLabel,
} from "@/lib/enum-labels";
import { formatMoney } from "@/lib/format";

const day = (v: number | null) =>
  v == null ? "—" : v === 31 ? "月末" : `${v}日`;

const days = (v: number | null) => (v == null ? "—" : `${v}日`);

/**
 * 概要タブの 1 セクション。「一般」（取引先そのものの情報）と、付与されている
 * ロールごとのセクションを同じ体裁で並べる。role を渡すと見出しにロール色の
 * ドットが付き、一覧のバッジ色と対応が取れる。
 */
function OverviewSection({
  title,
  bpRole,
  children,
}: {
  title: string;
  bpRole?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group align="center" gap="xs" mb="sm">
        {bpRole && (
          <Box
            bg={`var(--mantine-color-${BP_ROLE_COLOR[bpRole] ?? "gray"}-6)`}
            h={10}
            style={{ borderRadius: 9999, flexShrink: 0 }}
            w={10}
          />
        )}
        <Title order={5}>{title}</Title>
      </Group>
      <Divider mb="md" />
      {children}
    </Paper>
  );
}

export function BpDetail({
  record,
  auditEntries,
}: {
  record: BpDetailData;
  auditEntries: AuditEntry[];
}) {
  const tr = useTr();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    bpCode: record.bpCode,
    name: record.nameJa,
    isActive: record.isActive,
  };
  const hasRole = (role: string) => record.roles.includes(role as never);
  const customer = hasRole("CUSTOMER") ? record.customer : null;
  const endUser = hasRole("END_USER") ? record.endUser : null;
  const vendor = hasRole("VENDOR") ? record.vendor : null;

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: record.isActive ? "無効化" : tr("有効化"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: "削除",
              icon: <IconTrash size={14} />,
              color: "red",
              divider: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
          onEdit={() => router.push(`${BP_BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("取引先"), href: BP_BASE_PATH },
        record.bpCode,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <BpBaseSummary
        extra={
          <FieldValue
            label={tr("ロール")}
            value={
              <BpRoleBadges
                roles={record.roles}
                vendorType={record.vendor?.vendorType}
              />
            }
          />
        }
        record={record}
      />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("概要")}</Tabs.Tab>
          <Tabs.Tab value="contacts">{tr("担当者")}</Tabs.Tab>
          <Tabs.Tab value="branches">{tr("支店一覧")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("見積・受注履歴")}</Tabs.Tab>
          <Tabs.Tab value="audit">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {/* 一般 — ロールに関係なく取引先そのものに紐づく情報。 */}
            <OverviewSection title={tr("一般")}>
              <FieldValue label={tr("備考")} value={record.notes || "—"} />
            </OverviewSection>

            {/* ロール別 — 付与されているロールの分だけセクションが並ぶ。 */}
            {record.roles.length === 0 && (
              <OverviewSection title={tr("ロール")}>
                <Text c="dimmed" size="sm">
                  {tr(
                    tr(
                      "ロールが設定されていません。「編集」から顧客・最終需要家・\n                  仕入先・外注先のいずれかを付与すると、各書類で選べるように\n                  なります。",
                    ),
                  )}
                </Text>
              </OverviewSection>
            )}

            {customer && (
              <OverviewSection bpRole="CUSTOMER" title={tr("顧客")}>
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("旧システムコード")}
                    value={customer.customerCode || "—"}
                  />
                  <FieldValue
                    label={tr("請求先")}
                    value={customer.billingName}
                  />
                  <FieldValue
                    label={tr("締日")}
                    value={day(customer.closingDay)}
                  />
                  <FieldValue
                    label={tr("支払サイト")}
                    value={days(customer.paymentTermsDays)}
                  />
                  <FieldValue
                    label={tr("支払日")}
                    value={days(customer.paymentDay)}
                  />
                  <FieldValue
                    label={tr("与信限度額")}
                    value={formatMoney(customer.creditLimit)}
                  />
                  <FieldValue
                    label={tr("課税区分")}
                    value={
                      taxTypeLabel(customer.taxType, locale) ?? customer.taxType
                    }
                  />
                  <FieldValue
                    label={tr("請求書送付方法")}
                    value={
                      invoiceMethodLabel(customer.invoiceMethod, locale) ??
                      customer.invoiceMethod
                    }
                  />
                </Group>
                <Checkbox
                  checked={customer.isConsignment}
                  label={tr("委託先")}
                  mt="sm"
                  readOnly
                />
                <Box mt="sm">
                  <FieldValue
                    label={tr("営業担当")}
                    value={
                      customer.salesReps.length > 0 ? (
                        <Group gap="xs" wrap="wrap">
                          {customer.salesReps.map((rep) => (
                            <Badge
                              color={rep.isPrimary ? "blue" : "gray"}
                              key={rep.userId}
                              variant="light"
                            >
                              {rep.name}
                              {rep.isPrimary ? "（主担当）" : ""}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        "—"
                      )
                    }
                  />
                </Box>
              </OverviewSection>
            )}

            {endUser && (
              <OverviewSection bpRole="END_USER" title={tr("最終需要家")}>
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("業種")}
                    value={endUser.industry || "—"}
                  />
                </Group>
              </OverviewSection>
            )}

            {vendor && (
              <OverviewSection bpRole="VENDOR" title={tr("仕入先・外注先")}>
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("外注種別")}
                    value={
                      <Badge color="teal" size="sm" variant="light">
                        {vendorTypeLabel(vendor.vendorType, locale) ??
                          vendor.vendorType}
                      </Badge>
                    }
                  />
                  <FieldValue
                    label={tr("旧システムコード")}
                    value={vendor.vendorCode || "—"}
                  />
                  <FieldValue
                    label={tr("締日")}
                    value={day(vendor.closingDay)}
                  />
                  <FieldValue
                    label={tr("支払サイト")}
                    value={days(vendor.paymentTermsDays)}
                  />
                  <FieldValue
                    label={tr("支払日")}
                    value={days(vendor.paymentDay)}
                  />
                  <FieldValue
                    label={tr("標準リードタイム")}
                    value={days(vendor.leadTimeDays)}
                  />
                </Group>
                <Divider label={tr("振込先")} labelPosition="left" my="sm" />
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("銀行名")}
                    value={vendor.bankName || "—"}
                  />
                  <FieldValue
                    label={tr("支店名")}
                    value={vendor.bankBranch || "—"}
                  />
                  <FieldValue
                    label={tr("口座種別")}
                    value={vendor.bankAccountType || "—"}
                  />
                  <FieldValue
                    label={tr("口座番号")}
                    value={vendor.bankAccountNumber || "—"}
                  />
                </Group>
              </OverviewSection>
            )}
          </Stack>
        </Tabs.Panel>

        {/* 担当者はロールに依らず取引先共通。件数が増えると縦に伸びるので、
            概要のロール別セクションを圧迫しないよう独立タブにしている。 */}
        <Tabs.Panel pt="md" value="contacts">
          <ContactsTable
            bpId={record.id}
            bpName={record.nameJa}
            contacts={record.contacts}
            hideHeading
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="branches">
          <Group justify="flex-end" mb="xs">
            <GhostButton
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                router.push(`${BP_BASE_PATH}/${record.id}/branches/new`)
              }
            >
              {tr("支店を追加")}
            </GhostButton>
          </Group>
          {record.branches.length === 0 ? (
            <EmptyState
              icon={<IconBuildingStore size={24} />}
              message={tr("支店は登録されていません")}
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("支店名")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("電話番号")}</Table.Th>}
                  <Table.Th>{tr("主担当")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {record.branches.map((b) => (
                  <Table.Tr
                    className="cursor-pointer"
                    key={b.id}
                    onClick={() =>
                      router.push(
                        `${BP_BASE_PATH}/${record.id}/branches/${b.id}`,
                      )
                    }
                  >
                    <Table.Td>{b.name}</Table.Td>
                    {!isMobile && <Table.Td>{b.phone || "—"}</Table.Td>}
                    <Table.Td>{b.contact}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          {record.history.length === 0 ? (
            <EmptyState
              icon={<IconFileText size={24} />}
              message={tr("見積・受注はまだありません")}
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("番号")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("種別")}</Table.Th>}
                  <Table.Th style={{ textAlign: "right" }}>
                    {tr("金額")}
                  </Table.Th>
                  <Table.Th>{tr("状態")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("作成日")}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {record.history.map((h) => (
                  <Table.Tr
                    className="cursor-pointer"
                    key={h.number}
                    onClick={() => router.push(`/sales/quotes/${h.number}`)}
                  >
                    <Table.Td>
                      <DocNumber>{h.number}</DocNumber>
                    </Table.Td>
                    {!isMobile && (
                      <Table.Td>
                        <Badge color="blue" size="xs" variant="light">
                          {h.label}
                        </Badge>
                      </Table.Td>
                    )}
                    <Table.Td style={{ textAlign: "right" }}>
                      {formatMoney(h.amount)}
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge
                        entity={h.status.entity}
                        status={h.status.value}
                      />
                    </Table.Td>
                    {!isMobile && <Table.Td>{fmt.date(h.date)}</Table.Td>}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="audit">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteBpModal
        entityLabel={tr("取引先")}
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BP_BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel={tr("取引先")}
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
