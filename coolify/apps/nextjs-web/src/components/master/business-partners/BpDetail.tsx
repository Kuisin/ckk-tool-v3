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
import { useLocale, useTranslations } from "next-intl";
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
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  BP_ROLE_COLOR,
  invoiceMethodLabel,
  taxTypeLabel,
  vendorTypeLabel,
} from "@/lib/enum-labels";
import { formatMoney } from "@/lib/format";
import type { Tr } from "@/lib/i18n";

// フックを使えない素の関数なので、解決済みの `tr` を引数で受ける。
const day = (v: number | null, tr: Tr) =>
  v == null
    ? "—"
    : v === 31
      ? tr("master.businessPartners.endOfMonth")
      : tr("master.businessPartners.daySuffix", { value: v });

const days = (v: number | null, tr: Tr) =>
  v == null ? "—" : tr("master.businessPartners.daySuffix", { value: v });

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
  const tr = useTranslations();
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
              label: record.isActive
                ? tr("common.disable")
                : tr("common.enable"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: tr("common.delete"),
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
        tr("common.masterData"),
        { label: tr("common.businessPartners"), href: BP_BASE_PATH },
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
            label={tr("common.role")}
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
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="contacts">{tr("common.assignee")}</Tabs.Tab>
          <Tabs.Tab value="branches">
            {tr("master.businessPartners.branches")}
          </Tabs.Tab>
          <Tabs.Tab value="history">
            {tr("master.businessPartners.quoteAndOrderHistory")}
          </Tabs.Tab>
          <Tabs.Tab value="audit">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {/* 一般 — ロールに関係なく取引先そのものに紐づく情報。 */}
            <OverviewSection title={tr("common.general")}>
              <FieldValue
                label={tr("common.notes")}
                value={record.notes || "—"}
              />
            </OverviewSection>

            {/* ロール別 — 付与されているロールの分だけセクションが並ぶ。 */}
            {record.roles.length === 0 && (
              <OverviewSection title={tr("common.role")}>
                <Text c="dimmed" size="sm">
                  {tr("master.businessPartners.noRoleIsSetGrantCustomer")}
                </Text>
              </OverviewSection>
            )}

            {customer && (
              <OverviewSection bpRole="CUSTOMER" title={tr("common.customer")}>
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("common.legacySystemCode")}
                    value={customer.customerCode || "—"}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.billTo")}
                    value={customer.billingName}
                  />
                  <FieldValue
                    label={tr("common.closingDay")}
                    value={day(customer.closingDay, tr)}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.paymentTerms")}
                    value={days(customer.paymentTermsDays, tr)}
                  />
                  <FieldValue
                    label={tr("common.paymentDay")}
                    value={days(customer.paymentDay, tr)}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.creditLimit")}
                    value={formatMoney(customer.creditLimit)}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.taxType")}
                    value={
                      taxTypeLabel(customer.taxType, locale) ?? customer.taxType
                    }
                  />
                  <FieldValue
                    label={tr("master.businessPartners.invoiceDeliveryMethod")}
                    value={
                      invoiceMethodLabel(customer.invoiceMethod, locale) ??
                      customer.invoiceMethod
                    }
                  />
                </Group>
                <Checkbox
                  checked={customer.isConsignment}
                  label={tr("master.businessPartners.consignee")}
                  mt="sm"
                  readOnly
                />
                <Box mt="sm">
                  <FieldValue
                    label={tr("common.salesRep")}
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
                              {rep.isPrimary
                                ? tr(
                                    "master.businessPartners.primaryContactTag",
                                  )
                                : ""}
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
              <OverviewSection bpRole="END_USER" title={tr("common.endUser")}>
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("master.businessPartners.industry")}
                    value={endUser.industry || "—"}
                  />
                </Group>
              </OverviewSection>
            )}

            {vendor && (
              <OverviewSection
                bpRole="VENDOR"
                title={tr("master.businessPartners.supplierSubcontractor")}
              >
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("master.businessPartners.subcontractorType")}
                    value={
                      <Badge color="teal" size="sm" variant="light">
                        {vendorTypeLabel(vendor.vendorType, locale) ??
                          vendor.vendorType}
                      </Badge>
                    }
                  />
                  <FieldValue
                    label={tr("common.legacySystemCode")}
                    value={vendor.vendorCode || "—"}
                  />
                  <FieldValue
                    label={tr("common.closingDay")}
                    value={day(vendor.closingDay, tr)}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.paymentTerms")}
                    value={days(vendor.paymentTermsDays, tr)}
                  />
                  <FieldValue
                    label={tr("common.paymentDay")}
                    value={days(vendor.paymentDay, tr)}
                  />
                  <FieldValue
                    label={tr("master.businessPartners.standardLeadTime")}
                    value={days(vendor.leadTimeDays, tr)}
                  />
                </Group>
                <Divider
                  label={tr("common.bankAccount")}
                  labelPosition="left"
                  my="sm"
                />
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label={tr("common.bankName")}
                    value={vendor.bankName || "—"}
                  />
                  <FieldValue
                    label={tr("common.branchName")}
                    value={vendor.bankBranch || "—"}
                  />
                  <FieldValue
                    label={tr("common.accountType")}
                    value={vendor.bankAccountType || "—"}
                  />
                  <FieldValue
                    label={tr("common.accountNumber")}
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
              {tr("master.businessPartners.addABranch")}
            </GhostButton>
          </Group>
          {record.branches.length === 0 ? (
            <EmptyState
              icon={<IconBuildingStore size={24} />}
              message={tr("master.businessPartners.noBranchesAreRegistered")}
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.branchName")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("common.phoneNumber")}</Table.Th>}
                  <Table.Th>{tr("common.primaryContact")}</Table.Th>
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
              message={tr("master.businessPartners.thereAreNoQuotesOrOrders")}
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.number")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("common.type2")}</Table.Th>}
                  <Table.Th style={{ textAlign: "right" }}>
                    {tr("common.amount")}
                  </Table.Th>
                  <Table.Th>{tr("common.status")}</Table.Th>
                  {!isMobile && <Table.Th>{tr("common.createdOn")}</Table.Th>}
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
        entityLabel={tr("common.businessPartners")}
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BP_BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel={tr("common.businessPartners")}
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
