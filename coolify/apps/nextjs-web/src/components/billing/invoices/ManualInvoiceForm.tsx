"use client";

/**
 * ManualInvoiceForm — 手動請求 (BL11, design.md §8.3).
 *
 * 顧客を選ぶ → その顧客の未請求出荷（締日窓に依らず全件）を一覧 → 選んで
 * 「請求書を作成」。締日を待たない臨時請求（§9） — billing_closings に
 * kind=MANUAL の行が 1 本残り、明細組み立て・税計算は締日処理と同じ
 * 関数（lib/invoice-generation.ts）を通る。
 */

import { LoadingOverlay, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileInvoice, IconTruck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createManualInvoice,
  searchUnbilledShipments,
} from "@/app/(dashboard)/billing/invoices/new/actions";
import type { UnbilledShipmentRow } from "@/app/(dashboard)/billing/invoices/new/data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { CancelButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";

const BASE_PATH = "/billing/invoices";

export function ManualInvoiceForm({
  customerOptions,
}: {
  customerOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  const [customerBpId, setCustomerBpId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<UnbilledShipmentRow[]>([]);

  const onCustomerChange = (value: string | null) => {
    setCustomerBpId(value);
    setShipments([]);
    if (!value) return;
    startTransition(async () => {
      const result = await searchUnbilledShipments(value);
      if (result.ok) {
        setShipments(result.data);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const columns: Column<UnbilledShipmentRow>[] = [
    {
      key: "deliveryOrderNumber",
      header: tr("common.deliveryOrder"),
      render: (s) => (
        <Text ff="mono" size="sm">
          {s.deliveryOrderNumber}
        </Text>
      ),
    },
    {
      key: "deliveryNoteNumber",
      header: tr("common.deliveryNote"),
      render: (s) => (
        <Text
          c={s.deliveryNoteNumber ? undefined : "dimmed"}
          ff="mono"
          size="sm"
        >
          {s.deliveryNoteNumber ?? "—"}
        </Text>
      ),
    },
    {
      key: "shippedAt",
      header: tr("common.shippedDate"),
      width: 120,
      sortValue: (s) => s.shippedAt ?? "",
      render: (s) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(s.shippedAt)}
        </Text>
      ),
    },
    {
      key: "quantity",
      header: tr("common.quantity"),
      width: 100,
      align: "right",
      sortValue: (s) => s.quantity,
      render: (s) => (
        <Text className="tabular-nums" size="sm">
          {s.quantity}
        </Text>
      ),
    },
    {
      key: "amount",
      header: tr("common.amount"),
      width: 130,
      align: "right",
      sortValue: (s) => s.amount,
      render: (s) => <MoneyText value={s.amount} />,
    },
  ];

  /** 選んだ出荷から請求書を作る — DataTable の一括操作バーがそのまま「作成」ボタンになる。 */
  const save = (selected: UnbilledShipmentRow[]) => {
    if (!customerBpId || selected.length === 0) return;
    const deliveryOrderKeys = selected.map((s) => ({
      yearMonth: s.yearMonth,
      seq: s.seq,
    }));
    startSaveTransition(async () => {
      const result = await createManualInvoice({
        customerBpId,
        deliveryOrderKeys,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.created"),
          message: tr("billing.invoiceDetail.issuedWithNumber", {
            invoiceNumber: result.data.invoiceNumber,
          }),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.invoiceNumber}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={<CancelButton onClick={() => router.push(BASE_PATH)} />}
        breadcrumbs={[
          tr("common.billing"),
          { label: tr("common.invoice"), href: BASE_PATH },
          tr("billing.invoiceTable.manualInvoice"),
        ]}
        title={tr("billing.invoiceTable.manualInvoice")}
      />
      <div style={{ position: "relative" }}>
        <LoadingOverlay visible={isSaving} />
        <Stack gap="md">
          <FormSection
            description={tr("billing.invoices.manualInvoiceHelp")}
            required
            title={tr("common.customer")}
          >
            <Select
              data={customerOptions}
              onChange={onCustomerChange}
              placeholder={tr("common.customer")}
              searchable
              value={customerBpId}
            />
          </FormSection>

          {customerBpId && (
            <FormSection title={tr("billing.invoices.unbilledShipments")}>
              <DataTable
                bulkActions={[
                  {
                    label: tr("billing.invoices.createInvoiceFromSelection"),
                    icon: <IconFileInvoice size={16} />,
                    color: "blue",
                    onAction: save,
                  },
                ]}
                columns={columns}
                data={shipments}
                defaultSort={{ key: "shippedAt", dir: "desc" }}
                emptyIcon={<IconTruck size={24} />}
                emptyMessage={
                  isPending
                    ? tr("common.loading")
                    : tr("billing.invoices.noUnbilledShipmentsForCustomer")
                }
                getRowId={(s) => `${s.yearMonth}-${s.seq}`}
                selectable
              />
            </FormSection>
          )}
        </Stack>
      </div>
    </Stack>
  );
}
