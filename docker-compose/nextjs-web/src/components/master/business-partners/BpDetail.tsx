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
  INVOICE_METHOD_LABEL,
  TAX_TYPE_LABEL,
  VENDOR_TYPE_LABEL,
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
              label: record.isActive ? "無効化" : "有効化",
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
        "マスタ",
        { label: "取引先", href: BP_BASE_PATH },
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
            label="ロール"
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

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="contacts">担当者</Tabs.Tab>
          <Tabs.Tab value="branches">支店一覧</Tabs.Tab>
          <Tabs.Tab value="history">見積・受注履歴</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {/* 一般 — ロールに関係なく取引先そのものに紐づく情報。 */}
            <OverviewSection title="一般">
              <FieldValue label="備考" value={record.notes || "—"} />
            </OverviewSection>

            {/* ロール別 — 付与されているロールの分だけセクションが並ぶ。 */}
            {record.roles.length === 0 && (
              <OverviewSection title="ロール">
                <Text c="dimmed" size="sm">
                  ロールが設定されていません。「編集」から顧客・最終需要家・
                  仕入先・外注先のいずれかを付与すると、各書類で選べるように
                  なります。
                </Text>
              </OverviewSection>
            )}

            {customer && (
              <OverviewSection bpRole="CUSTOMER" title="顧客">
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label="旧システムコード"
                    value={customer.customerCode || "—"}
                  />
                  <FieldValue label="請求先" value={customer.billingName} />
                  <FieldValue label="締日" value={day(customer.closingDay)} />
                  <FieldValue
                    label="支払サイト"
                    value={days(customer.paymentTermsDays)}
                  />
                  <FieldValue
                    label="支払日"
                    value={days(customer.paymentDay)}
                  />
                  <FieldValue
                    label="与信限度額"
                    value={formatMoney(customer.creditLimit)}
                  />
                  <FieldValue
                    label="課税区分"
                    value={TAX_TYPE_LABEL[customer.taxType] ?? customer.taxType}
                  />
                  <FieldValue
                    label="請求書送付方法"
                    value={
                      INVOICE_METHOD_LABEL[customer.invoiceMethod] ??
                      customer.invoiceMethod
                    }
                  />
                </Group>
                <Checkbox
                  checked={customer.isConsignment}
                  label="委託先"
                  mt="sm"
                  readOnly
                />
                <Box mt="sm">
                  <FieldValue
                    label="営業担当"
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
              <OverviewSection bpRole="END_USER" title="最終需要家">
                <Group gap="xl" wrap="wrap">
                  <FieldValue label="業種" value={endUser.industry || "—"} />
                </Group>
              </OverviewSection>
            )}

            {vendor && (
              <OverviewSection bpRole="VENDOR" title="仕入先・外注先">
                <Group gap="xl" wrap="wrap">
                  <FieldValue
                    label="外注種別"
                    value={
                      <Badge color="teal" size="sm" variant="light">
                        {VENDOR_TYPE_LABEL[vendor.vendorType] ??
                          vendor.vendorType}
                      </Badge>
                    }
                  />
                  <FieldValue
                    label="旧システムコード"
                    value={vendor.vendorCode || "—"}
                  />
                  <FieldValue label="締日" value={day(vendor.closingDay)} />
                  <FieldValue
                    label="支払サイト"
                    value={days(vendor.paymentTermsDays)}
                  />
                  <FieldValue label="支払日" value={days(vendor.paymentDay)} />
                  <FieldValue
                    label="標準リードタイム"
                    value={days(vendor.leadTimeDays)}
                  />
                </Group>
                <Divider label="振込先" labelPosition="left" my="sm" />
                <Group gap="xl" wrap="wrap">
                  <FieldValue label="銀行名" value={vendor.bankName || "—"} />
                  <FieldValue label="支店名" value={vendor.bankBranch || "—"} />
                  <FieldValue
                    label="口座種別"
                    value={vendor.bankAccountType || "—"}
                  />
                  <FieldValue
                    label="口座番号"
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
              支店を追加
            </GhostButton>
          </Group>
          {record.branches.length === 0 ? (
            <EmptyState
              icon={<IconBuildingStore size={24} />}
              message="支店は登録されていません"
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>支店名</Table.Th>
                  {!isMobile && <Table.Th>電話番号</Table.Th>}
                  <Table.Th>主担当</Table.Th>
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
              message="見積・受注はまだありません"
            />
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>番号</Table.Th>
                  {!isMobile && <Table.Th>種別</Table.Th>}
                  <Table.Th style={{ textAlign: "right" }}>金額</Table.Th>
                  <Table.Th>状態</Table.Th>
                  {!isMobile && <Table.Th>作成日</Table.Th>}
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
      </Tabs>

      <DeleteBpModal
        entityLabel="取引先"
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BP_BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel="取引先"
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
