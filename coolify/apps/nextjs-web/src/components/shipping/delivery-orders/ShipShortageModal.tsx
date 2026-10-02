"use client";

/**
 * ShipShortageModal — 出荷を押したとき、在庫が足りない品目を見せて選ばせる。
 *
 * 出荷は在庫では止まらない（物はもう出ているので、記録だけ拒んでも現実は
 * 変わらない — #907）。ただし**黙って通すと、台帳がマイナスになったことに
 * 誰も気づかないまま終わる**。なので押す前に一度だけここで止め、
 *
 *   - 何が何本足りないのか
 *   - その品目の在庫を見に行く（在庫・所要量 ST03 — 別タブで開く）
 *   - それでも出す
 *
 * の 3 つを出す。「やめる」が既定の逃げ道で、進む側は自分で押す必要がある。
 */

import { Alert, Anchor, Stack, Table, Text } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import type { DeliveryStockShortage } from "@/app/(dashboard)/shipping/delivery-orders/actions";
import { ModalShell } from "@/components/ui/modals";
import type { Locale } from "@/lib/i18n";

/**
 * その品目の在庫を見る先。**在庫・所要量 (ST03)** は品目 1 つの「これから
 * 入る・出る」を時系列で出す画面で、足りない理由（入荷待ちなのか、そもそも
 * 作っていないのか）を追えるのはここだけ。拠点が決まっていない出荷書では
 * 品目だけ渡す（画面側で拠点を選んでもらう）。
 */
function stockHref(itemId: number, plantId: number | null): string {
  const params = new URLSearchParams({ item: String(itemId) });
  if (plantId != null) params.set("plant", String(plantId));
  return `/inventory/requirements?${params.toString()}`;
}

export function ShipShortageModal({
  opened,
  onClose,
  onConfirm,
  shortages,
  fromPlantId,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  shortages: DeliveryStockShortage[];
  /** 出荷元拠点（ST03 のリンクに渡す。未設定なら品目だけ）。 */
  fromPlantId: number | null;
  loading?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;

  return (
    <ModalShell
      confirmColor="orange"
      confirmLabel={tr("shipping.deliveryOrders.shipAnyway")}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
      opened={opened}
      size="lg"
      title={tr("shipping.deliveryOrders.notEnoughStockTitle")}
    >
      <Stack gap="md">
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          {tr("shipping.deliveryOrders.notEnoughStockBody")}
        </Alert>
        <Table.ScrollContainer minWidth={480}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.product")}</Table.Th>
                <Table.Th>{tr("common.lot")}</Table.Th>
                <Table.Th ta="right">
                  {tr("shipping.deliveryOrders.shortfall")}
                </Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shortages.map((s) => (
                <Table.Tr key={`${s.itemId}:${s.lotNumber ?? "-"}`}>
                  <Table.Td>
                    <Text ff="mono" size="sm">
                      {s.item}
                    </Text>
                  </Table.Td>
                  <Table.Td>{s.lotNumber ?? "—"}</Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    <Text c="red" fw={600} size="sm">
                      {s.shortfall.toLocaleString(locale)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {/*
                      別タブで開く。ここで画面を離れると、出荷するかどうかの
                      判断をやり直すことになる。
                    */}
                    <Anchor
                      href={stockHref(s.itemId, fromPlantId)}
                      rel="noopener noreferrer"
                      size="sm"
                      target="_blank"
                    >
                      {tr("shipping.deliveryOrders.viewStock")}{" "}
                      <IconExternalLink size={12} />
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </ModalShell>
  );
}
