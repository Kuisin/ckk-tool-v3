"use client";

/**
 * OrderRequestAcceptPanel — final acceptance step of the 受注請書 flow.
 *
 * Shows the confirmed content read-only (as it would appear on the issued
 * 請書), previews the documents the acceptance would create — one 注文請書
 * (sales order) plus 指示書 (work orders) grouped by product & version /
 * customization / delivery date / ship-to — flags total mismatches, and asks
 * for the explicit 受諾 action via a modal. UI/UX only — no DB persistence.
 */

import {
  Alert,
  Badge,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconClipboardList,
  IconFileCheck,
  IconSettings2,
} from "@tabler/icons-react";
import { useState } from "react";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { groupWorkOrders, type OrderRequest } from "./types";

export function OrderRequestAcceptPanel({
  data,
  onBack,
  onAccept,
}: {
  data: OrderRequest;
  onBack: () => void;
  onAccept: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const items = data.items ?? [];
  const workOrders = groupWorkOrders(data);
  const itemSum = items.reduce((acc, it) => acc + (it.amount ?? 0), 0);
  const subtotalMismatch =
    data.subtotal != null &&
    items.some((it) => it.amount != null) &&
    itemSum !== data.subtotal;
  const totalMismatch =
    data.subtotal != null &&
    data.total_amount != null &&
    data.subtotal + (data.tax_amount ?? 0) !== data.total_amount;

  return (
    <Stack gap="md">
      {(subtotalMismatch || totalMismatch) && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          {subtotalMismatch
            ? "明細の金額合計と小計が一致しません。"
            : "小計 + 消費税が合計金額と一致しません。"}
          戻って金額をご確認ください。
        </Alert>
      )}

      <Paper p="lg" radius="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>受注請書（受諾内容の確認）</Title>
          <Badge color="yellow" variant="light">
            受諾待ち
          </Badge>
        </Group>
        <Divider mb="md" />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <FieldValue label="顧客（受注元）" value={data.customer_name} />
          <FieldValue label="支店・事業所" value={data.customer_branch} />
          <FieldValue label="先方担当者" value={data.customer_contact} />
          <FieldValue
            label="顧客注文書番号"
            value={
              data.customer_order_ref && (
                <Text ff="mono" size="sm" span>
                  {data.customer_order_ref}
                </Text>
              )
            }
          />
          <FieldValue label="注文日" value={data.order_date} />
          <FieldValue label="希望納期" value={data.desired_delivery_date} />
          <FieldValue label="受渡場所" value={data.delivery_location} />
          <FieldValue label="支払条件" value={data.payment_terms} />
        </SimpleGrid>

        <Divider my="md" />

        <Table.ScrollContainer minWidth={640}>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>品名</Table.Th>
                <Table.Th>品番</Table.Th>
                <Table.Th>版数</Table.Th>
                <Table.Th>注文種別</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
                <Table.Th>納期</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((it, i) => (
                <Table.Tr key={`${it.product_name}-${i}`}>
                  <Table.Td>{it.product_name ?? "—"}</Table.Td>
                  <Table.Td>
                    <Text ff="mono" size="sm" span>
                      {it.product_code ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ff="mono" size="sm" span>
                      {it.version ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {it.order_type ? (
                      <Badge color="gray" variant="light">
                        {ORDER_TYPE_LABEL[it.order_type] ?? it.order_type}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.quantity != null
                      ? `${it.quantity.toLocaleString()} ${it.unit ?? ""}`
                      : "—"}
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={it.unit_price} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={it.amount} />
                  </Table.Td>
                  <Table.Td>{it.delivery_date ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Group justify="flex-end" mt="md">
          <Stack gap={4} miw={220}>
            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                小計
              </Text>
              <MoneyText value={data.subtotal} />
            </Group>
            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                消費税{data.tax_rate != null ? `（${data.tax_rate}%）` : ""}
              </Text>
              <MoneyText value={data.tax_amount} />
            </Group>
            <Divider />
            <Group justify="space-between">
              <Text fw={700} size="sm">
                合計金額
              </Text>
              <Text className="tabular-nums" ff="mono" fw={700} size="sm">
                <MoneyText value={data.total_amount} />
              </Text>
            </Group>
          </Stack>
        </Group>

        {data.notes && (
          <>
            <Divider my="md" />
            <FieldValue label="備考" value={data.notes} />
          </>
        )}
      </Paper>

      <Paper p="lg" radius="md" withBorder>
        <Title mb={4} order={5}>
          受諾時に作成される伝票（プレビュー）
        </Title>
        <Text c="dimmed" mb="md" size="xs">
          注文請書 1 件と、製品・版数 / カスタム / 納期 /
          届け先ごとにまとめた指示書 {workOrders.length} 件が作成されます。
        </Text>

        <Paper mb="sm" p="sm" radius="sm" withBorder>
          <Group gap="sm" wrap="nowrap">
            <IconClipboardList size={18} />
            <Text fw={600} size="sm">
              注文請書
            </Text>
            <Badge color="blue" variant="light">
              1 件
            </Badge>
            <Text c="dimmed" size="xs" truncate>
              {data.customer_name ?? "顧客未設定"} ／ 明細 {items.length} 行
            </Text>
          </Group>
        </Paper>

        <Stack gap="xs">
          {workOrders.map((wo, i) => (
            <Paper
              key={`${wo.product_code}-${wo.version}-${wo.delivery_date}-${i}`}
              p="sm"
              radius="sm"
              withBorder
            >
              <Group gap="sm" wrap="nowrap">
                <IconSettings2 size={18} />
                <Text fw={600} size="sm" style={{ whiteSpace: "nowrap" }}>
                  指示書 {i + 1}
                </Text>
                <Text size="sm" truncate>
                  {wo.product_name ?? "—"}
                  {wo.product_code && (
                    <Text c="dimmed" ff="mono" size="xs" span>
                      {" "}
                      {wo.product_code}
                    </Text>
                  )}
                </Text>
                {wo.version && (
                  <Badge color="gray" variant="outline">
                    版 {wo.version}
                  </Badge>
                )}
                {wo.customization && (
                  <Badge color="violet" variant="light">
                    カスタム
                  </Badge>
                )}
              </Group>
              <Group gap="xl" mt={6} pl={30}>
                <Text c="dimmed" size="xs">
                  数量: {wo.total_quantity.toLocaleString()} {wo.unit ?? ""}
                </Text>
                <Text c="dimmed" size="xs">
                  納期: {wo.delivery_date ?? "—"}
                </Text>
                <Text c="dimmed" size="xs" truncate>
                  届け先: {wo.ship_to ?? "—"}
                </Text>
              </Group>
              {wo.customization && (
                <Text c="dimmed" mt={2} pl={30} size="xs" truncate>
                  カスタム: {wo.customization}
                </Text>
              )}
            </Paper>
          ))}
        </Stack>
      </Paper>

      <Group justify="space-between">
        <GhostButton onClick={onBack}>戻って修正</GhostButton>
        <PrimaryButton
          leftSection={<IconFileCheck size={16} />}
          onClick={() => setConfirmOpen(true)}
        >
          受諾する
        </PrimaryButton>
      </Group>

      <ModalShell
        confirmLabel="受諾する"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onAccept();
        }}
        opened={confirmOpen}
        title="受注請書の受諾"
      >
        <Text size="sm">
          この内容で注文を受諾し、注文請書 1 件・指示書 {workOrders.length}{" "}
          件を作成します。よろしいですか？
        </Text>
        <Text c="dimmed" size="xs">
          ※ 本フローは UI/UX のみの実装です（DB 保存は行われません）。
        </Text>
      </ModalShell>
    </Stack>
  );
}
